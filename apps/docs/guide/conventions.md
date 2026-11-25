# Conventions

## TypeScript: strict and ESM

Every workspace extends `tsconfig.base.json` and has `"type": "module"`. The options that change
how you write code:

| Option                        | What it means for you                                                         |
| ----------------------------- | ----------------------------------------------------------------------------- |
| `strict`                      | No implicit `any`, strict null checks                                         |
| `noUncheckedIndexedAccess`    | `array[0]` and `record[key]` are `T \| undefined`. Check before you use them  |
| `verbatimModuleSyntax`        | Type-only imports must say so: `import type { User } from '@bossbyte/shared'` |
| `noImplicitOverride`          | Overriding a class member needs the `override` keyword                        |
| `moduleResolution: "Bundler"` | Relative imports have no file extension                                       |
| `noEmit`                      | `tsc` only type-checks. tsdown and Vite produce the output                    |

The target is ES2023. There is no CommonJS in the repository except `ecosystem.config.cjs`, which
PM2 requires in that format.

## Internal packages are just-in-time

`@bossbyte/shared` and `@bossbyte/ui` have no build step. Their `package.json` `exports` point
straight at TypeScript source:

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./constants": "./src/constants/index.ts",
    "./schemas": "./src/schemas/index.ts",
    "./utils": "./src/utils/index.ts"
  }
}
```

The consumer compiles them. Vite does it for the dashboard, `tsx` does it for the API in
development, and tsdown bundles `@bossbyte/shared` into the API's `dist/` for production. The
result: edit a schema and both apps pick it up at once, with nothing to rebuild or watch.

The one rule this imposes: a package can only use syntax and options that every consumer's
compiler accepts, which is why all workspaces share one base config.

## Formatting and linting

Prettier (`.prettierrc.json`): single quotes, semicolons, trailing commas, 100 columns. ESLint 10
uses one flat config at the root, `eslint.config.js`. Run both before you push:

```bash
npm run format
npm run lint
```

## Errors

Every error response from the API has one shape:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Validation failed",
    "details": [{ "path": "email", "message": "Enter a valid email address" }],
    "requestId": "0b9c4a6e-6a3b-4a39-9d0a-0d6c3f0f3f61"
  }
}
```

- `code` is a stable, snake_case identifier. Clients branch on it, never on `message`.
- `details` appears on validation errors, one entry per field.
- `requestId` matches the `x-request-id` response header and the log line.

In the API, throw; never build an error response by hand. Express 5 forwards errors thrown from
async handlers to the error handler.

```ts
import { badRequest, conflict, notFound } from '../../lib/errors';

throw notFound('File not found', 'file_not_found');
throw conflict('An account with that email already exists', 'email_taken');
throw badRequest('Attach a file in the "file" field', 'file_required');
```

`src/lib/errors.ts` also exports `unauthorized`, `forbidden`, `tooManyRequests` and
`notImplemented`, and the `AppError` class for anything else. A `ZodError` becomes a 400
`validation_error` automatically. Anything unrecognised becomes a 500 `internal_error` with a
generic message; the real error goes to the log, not the client.

## Routes are thin, services do the work

A route parses input with a shared schema, checks a permission, calls a service function and
sends the result. A service function takes plain arguments and returns plain data. It never sees
`req` or `res`, which is what makes it callable from a job or a test.

## Add a module end to end

This walkthrough adds a `notes` resource: a table, an API module, documentation, a test and a
dashboard page. None of this code is in the repository; it shows where each piece goes. Use the
`files` module as the working reference.

### 1. Define the contract in `@bossbyte/shared`

Create `packages/shared/src/schemas/note.ts`:

```ts
import { z } from 'zod';
import { idSchema, paginatedSchema } from './common';

export const noteSchema = z.object({
  id: idSchema,
  title: z.string(),
  body: z.string(),
  createdBy: idSchema,
  createdAt: z.iso.datetime(),
});

export const createNoteSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  body: z.string().max(10_000).default(''),
});

export const noteListSchema = paginatedSchema(noteSchema);

export type Note = z.infer<typeof noteSchema>;
export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type NoteList = z.infer<typeof noteListSchema>;
```

Export it from `packages/shared/src/schemas/index.ts`:

```ts
export * from './note';
```

### 2. Add permissions

In `packages/shared/src/constants/permissions.ts`, add the permissions to `PERMISSIONS` and to
each role that should hold them in `ROLE_PERMISSIONS`. `admin` gets every permission
automatically.

```ts
export const PERMISSIONS = [
  // …
  'notes:read',
  'notes:write',
] as const;
```

The `Permission` type updates itself, so `authorize('notes:read')` type-checks in the API and
`can('notes:read')` type-checks in the dashboard.

### 3. Write the migration

Create `apps/api/migrations/0004_notes.sql`. Migrations are plain SQL and run in filename order,
each in its own transaction.

```sql
-- 0004: notes.

CREATE TABLE notes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title      text NOT NULL,
  body       text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notes_created_by_idx ON notes (created_by);
```

Then describe the same table for Drizzle in `apps/api/src/db/schema.ts`:

```ts
export const notes = pgTable(
  'notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (table) => [index('notes_created_by_idx').on(table.createdBy)],
);

export type NoteRow = typeof notes.$inferSelect;
```

Apply it:

```bash
npm run db:migrate
```

If a column holds personal data, declare it with `encryptedText` instead of `text`. See
[Encryption](/api/encryption#encrypt-a-new-column).

### 4. Write the service

`apps/api/src/modules/notes/notes.service.ts`:

```ts
import type { CreateNoteInput, Note, NoteList, PaginationQuery } from '@bossbyte/shared';
import { buildPaginationMeta, paginationOffset } from '@bossbyte/shared';
import { count, desc } from 'drizzle-orm';
import { db } from '../../db/client';
import { notes, type NoteRow } from '../../db/schema';

export function toNoteDto(row: NoteRow): Note {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listNotes(query: PaginationQuery): Promise<NoteList> {
  const [rows, [totals]] = await Promise.all([
    db
      .select()
      .from(notes)
      .orderBy(desc(notes.createdAt), desc(notes.id))
      .limit(query.pageSize)
      .offset(paginationOffset(query.page, query.pageSize)),
    db.select({ total: count() }).from(notes),
  ]);
  return {
    data: rows.map(toNoteDto),
    meta: buildPaginationMeta(totals?.total ?? 0, query.page, query.pageSize),
  };
}

export async function createNote(input: CreateNoteInput, createdBy: string): Promise<Note> {
  const [row] = await db
    .insert(notes)
    .values({ ...input, createdBy })
    .returning();
  return toNoteDto(row!);
}
```

Always map rows to a DTO. The row type is the database's; the DTO is the contract.

### 5. Write the routes

`apps/api/src/modules/notes/notes.routes.ts`:

```ts
import { createNoteSchema, paginationQuerySchema } from '@bossbyte/shared';
import { Router } from 'express';
import { audit } from '../../lib/audit';
import { parseBody, parseQuery } from '../../lib/validate';
import { authenticate, authorize, currentUser } from '../../middleware/authenticate';
import { createNote, listNotes } from './notes.service';

export const notesRouter: Router = Router();

notesRouter.use(authenticate);

notesRouter.get('/', authorize('notes:read'), async (req, res) => {
  res.json(await listNotes(parseQuery(paginationQuerySchema, req)));
});

notesRouter.post('/', authorize('notes:write'), async (req, res) => {
  const note = await createNote(parseBody(createNoteSchema, req), currentUser(req).userId);
  await audit({ action: 'note.created', metadata: { noteId: note.id }, req });
  res.status(201).json(note);
});
```

Mount it in `apps/api/src/app.ts`, next to the others:

```ts
v1.use('/notes', notesRouter);
```

### 6. Document it

In `apps/api/src/docs/openapi.ts`, add the schemas to `requestSchemas` and `responseSchemas`
under the names you want in the document, then add one entry per endpoint to `routes`:

```ts
{
  method: 'post',
  path: '/notes',
  tag: 'Notes',
  summary: 'Create a note',
  permission: 'notes:write',
  body: 'CreateNote',
  status: 201,
  response: 'Note',
},
```

Reload http://localhost:4000/api/docs to see it.

### 7. Test it

Add `notes` to the `TRUNCATE` statement in `apps/api/tests/integration/setup.ts`, then create
`apps/api/tests/integration/notes.int.test.ts`:

```ts
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app, createTestUser } from './helpers';

describe('notes', () => {
  it('lets a manager create a note', async () => {
    const manager = await createTestUser({ role: 'manager' });

    const { body } = await request(app)
      .post('/api/v1/notes')
      .set('Authorization', manager.authorization)
      .send({ title: 'First note' })
      .expect(201);

    expect(body).toMatchObject({ title: 'First note', createdBy: manager.id });
  });

  it('refuses a viewer', async () => {
    const viewer = await createTestUser({ role: 'viewer' });

    await request(app)
      .post('/api/v1/notes')
      .set('Authorization', viewer.authorization)
      .send({ title: 'Nope' })
      .expect(403);
  });
});
```

```bash
npm run test:integration
```

### 8. Call it from the dashboard

`apps/core/src/features/notes/api.ts`:

```ts
import type { CreateNoteInput, Note, NoteList } from '@bossbyte/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function notesQueryOptions(page: number, pageSize: number) {
  return queryOptions({
    queryKey: ['notes', 'list', { page, pageSize }],
    queryFn: ({ signal }) => api.get<NoteList>('/notes', { query: { page, pageSize }, signal }),
  });
}

export function useCreateNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateNoteInput) => api.post<Note>('/notes', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notes'] }),
  });
}
```

### 9. Add the page

Create `apps/core/src/routes/_authenticated/notes.tsx`. The file's location makes it `/notes`
and puts it behind the session guard; the router plugin regenerates `routeTree.gen.ts` when you
save.

```tsx
import { Card, DataTable, type DataTableColumn } from '@bossbyte/ui';
import type { Note } from '@bossbyte/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { PageHeader } from '@/components/PageHeader';
import { RequirePermission } from '@/components/RequirePermission';
import { notesQueryOptions } from '@/features/notes/api';

export const Route = createFileRoute('/_authenticated/notes')({ component: NotesPage });

const columns: DataTableColumn<Note>[] = [
  { key: 'title', header: 'Title', cell: (note) => note.title },
  { key: 'body', header: 'Note', cell: (note) => note.body },
];

function NotesPage() {
  const notes = useQuery(notesQueryOptions(1, 20));

  return (
    <RequirePermission permission="notes:read" pageTitle="Notes">
      <PageHeader title="Notes" />
      <Card padded={false}>
        <DataTable
          caption="Notes"
          columns={columns}
          rows={notes.data?.data ?? []}
          rowKey={(note) => note.id}
          loading={notes.isPending}
        />
      </Card>
    </RequirePermission>
  );
}
```

Finally, add it to the navigation in `apps/core/src/components/AppShell.tsx`:

```ts
{ to: '/notes', label: 'Notes', permission: 'notes:read' },
```

For a form that creates a note with `createNoteSchema`, follow [Forms](/frontend/forms):
react-hook-form with `zodResolver` and the shared schema. `UserFormModal.tsx` in
`apps/core/src/features/users/` is the closest example to copy.

### Checklist

- [ ] Schema and types in `packages/shared`, exported from the index
- [ ] Permissions added and assigned to roles
- [ ] SQL migration, plus the matching Drizzle table
- [ ] Service (no `req`/`res`) and routes (parse, authorize, call, respond)
- [ ] Router mounted in `app.ts`
- [ ] Entry in `openapi.ts`
- [ ] Integration test, and the table added to the `TRUNCATE` list
- [ ] Query options, route file and navigation item in the dashboard
