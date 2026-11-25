# @bossbyte/shared

The contract between the API and the dashboard: Zod schemas, the TypeScript types inferred from
them, constants, and small pure helpers. It lives in `packages/shared`, depends only on Zod, and
runs unchanged in Node and in the browser.

```ts
import { loginSchema, type User, hasPermission, SECURITY, formatBytes } from '@bossbyte/shared';
```

Everything is exported from the root. Three subpaths exist if you prefer narrower imports:
`@bossbyte/shared/schemas`, `@bossbyte/shared/constants` and `@bossbyte/shared/utils`.

There is no build step. The API bundles the source with tsdown and the dashboard compiles it with
Vite.

## One schema, both sides

This is the reason the package exists. Take the user form.

**The schema** (`packages/shared/src/schemas/user.ts`):

```ts
export const createUserSchema = z.object({
  email: emailSchema,
  name: nameSchema,
  password: passwordSchema,
  role: roleSchema.default(DEFAULT_ROLE),
  phone: phoneSchema.nullish(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
```

**The API** validates the request body with it:

```ts
import { createUserSchema } from '@bossbyte/shared';
import { parseBody } from '../../lib/validate';

usersRouter.post('/', authorize('users:write'), async (req, res) => {
  const input = parseBody(createUserSchema, req); // typed as CreateUserInput
  res.status(201).json(await createUser(input));
});
```

**The dashboard** validates the form with it, before anything is sent:

```tsx
import { createUserSchema } from '@bossbyte/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

const form = useForm({ resolver: zodResolver(createUserSchema) });
```

Change the password policy or add a field in the schema, and the form, the endpoint and the types
all follow. The compiler points at every place that needs attention.

The server is still the authority. Browser validation is for the user's convenience; the API
validates every request again with the same schema.

## Schemas and types

Each schema has a matching type, inferred with `z.infer`. Import the type when you only need the
shape.

### Common (`schemas/common.ts`)

| Schema                  | Type              | Shape                                                                                            |
| ----------------------- | ----------------- | ------------------------------------------------------------------------------------------------ |
| `idSchema`              |                   | A UUID                                                                                           |
| `idParamSchema`         |                   | `{ id }`, for `/:id` routes                                                                      |
| `sortOrderSchema`       | `SortOrder`       | `'asc' \| 'desc'`                                                                                |
| `paginationQuerySchema` | `PaginationQuery` | `{ page, pageSize }`. Coerced from strings; `page` defaults to 1, `pageSize` to 20 (maximum 100) |
| `paginationMetaSchema`  | `PaginationMeta`  | `{ page, pageSize, total, totalPages }`                                                          |
| `paginatedSchema(item)` | `Paginated<T>`    | `{ data: T[], meta }`, the envelope of every list                                                |
| `apiErrorSchema`        | `ApiError`        | `{ error: { code, message, details?, requestId? } }`                                             |
| `messageSchema`         |                   | `{ message }`                                                                                    |

### Auth (`schemas/auth.ts`)

| Schema                                                                                                          | Type                                  | Used for                                                                                              |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `emailSchema`                                                                                                   |                                       | Trimmed, lower-cased, at most 254 characters                                                          |
| `passwordSchema`                                                                                                |                                       | The password policy: 12 to 128 characters with a lower-case letter, an upper-case letter and a number |
| `totpCodeSchema`                                                                                                |                                       | A 6-digit code                                                                                        |
| `loginSchema`                                                                                                   | `LoginInput`                          | `{ email, password }`                                                                                 |
| `registerSchema`                                                                                                | `RegisterInput`                       | `{ email, name, password }`                                                                           |
| `changePasswordSchema`                                                                                          | `ChangePasswordInput`                 | `{ currentPassword, newPassword }`; the two must differ                                               |
| `mfaVerifySchema`                                                                                               | `MfaVerifyInput`                      | Second step of a two-factor sign-in                                                                   |
| `totpEnableSchema`, `totpDisableSchema`                                                                         | `TotpEnableInput`, `TotpDisableInput` | Turning two-factor on and off                                                                         |
| `totpSetupResponseSchema`                                                                                       | `TotpSetupResponse`                   | The secret and QR code for an authenticator app                                                       |
| `firebaseLoginSchema`                                                                                           | `FirebaseLoginInput`                  | `{ idToken }`                                                                                         |
| `passkeyRegisterVerifySchema`, `passkeyLoginOptionsSchema`, `passkeyLoginVerifySchema`, `passkeyResponseSchema` |                                       | The WebAuthn ceremonies                                                                               |
| `passkeySchema`                                                                                                 | `Passkey`                             | A registered passkey                                                                                  |
| `authTokensSchema`                                                                                              | `AuthTokens`                          | The access token and its lifetime                                                                     |
| `loginResponseSchema`                                                                                           | `LoginResponse`                       | Either tokens, or a two-factor challenge                                                              |
| `csrfTokenSchema`                                                                                               |                                       | `{ csrfToken }`                                                                                       |

`loginSchema` deliberately checks only that a password is present, not the full policy. Telling
someone their existing password is too short helps nobody.

### Users (`schemas/user.ts`)

| Schema                 | Type                 | Notes                                                                                        |
| ---------------------- | -------------------- | -------------------------------------------------------------------------------------------- |
| `roleSchema`           | `Role`               | One of `ROLES`                                                                               |
| `nameSchema`           |                      | Trimmed, 1 to 120 characters                                                                 |
| `phoneSchema`          |                      | 7 to 20 digits, spaces, brackets and dashes, with an optional leading `+`                    |
| `userSchema`           | `User`               | What the API returns. Never includes the password hash or TOTP secret                        |
| `createUserSchema`     | `CreateUserInput`    | `role` defaults to `viewer`; `phone` is optional                                             |
| `updateUserSchema`     | `UpdateUserInput`    | Admin edit of another user                                                                   |
| `updateProfileSchema`  | `UpdateProfileInput` | `{ name, phone }` for `PATCH /auth/me`. Both are required; send `phone: null` to clear it    |
| `listUsersQuerySchema` | `ListUsersQuery`     | `search`, `role`, `sortBy` (`name`, `email` or `createdAt`), `sortOrder`, `page`, `pageSize` |
| `userListSchema`       | `UserList`           | `Paginated<User>`                                                                            |

Dates in responses are ISO 8601 strings (`z.iso.datetime()`), not `Date` objects, because that is
what JSON carries.

### Files (`schemas/file.ts`)

`fileSchema` (`StoredFile`), `fileUrlSchema` (`FileUrl`: `{ url, expiresIn }`) and
`fileListSchema` (`FileList`).

### Reports (`schemas/report.ts`)

`dashboardStatsSchema` (`DashboardStats`), `exportFormatSchema` (`ExportFormat`: `'xlsx'` or
`'csv'`), `exportRequestSchema`, `exportJobSchema` (`ExportJob`), `userImportRowSchema`
(`UserImportRow`) and `userImportPreviewSchema` (`UserImportPreview`).

### Valuation (`schemas/valuation.ts`)

`observationSchema` (`Observation`), and a request and result schema for each model:
`regressionRequestSchema` / `regressionResultSchema`, `comparablesRequestSchema` /
`comparablesResultSchema`, `ratioStudyRequestSchema` / `ratioStudyResultSchema` and
`boostedRequestSchema` / `boostedResultSchema`, with types named to match (`RegressionRequest`,
`RegressionResult`, …). See [Valuation models](/api/valuation).

### Parsing a response

The schemas describe responses as well as requests. The dashboard trusts its own API and uses
only the types, but for anything you do not control, parse:

```ts
import { userListSchema } from '@bossbyte/shared';

const users = userListSchema.parse(await response.json());
```

## Constants

### Roles and permissions

```ts
import {
  DEFAULT_ROLE, // 'viewer'
  PERMISSIONS, // ['users:read', 'users:write', …]
  ROLE_LABELS, // { admin: 'Administrator', manager: 'Manager', staff: 'Staff', viewer: 'Viewer' }
  ROLE_PERMISSIONS, // which permissions each role has
  ROLES, // ['admin', 'manager', 'staff', 'viewer']
  type Permission,
  type Role,
} from '@bossbyte/shared';
```

With the helpers that read them:

```ts
hasPermission('staff', 'files:write'); // true
hasPermission('viewer', 'files:write'); // false
hasEveryPermission('manager', ['users:read', 'users:write']); // true
hasAnyPermission('viewer', ['users:write', 'reports:read']); // true
permissionsForRole('viewer'); // ['files:read', 'reports:read']
```

The API's `authorize` middleware and the dashboard's `auth.can` both call `hasPermission`, so a
button and the endpoint behind it can never disagree. See [Authorization](/api/authorization).

### SECURITY

Limits the API enforces and the dashboard shows:

```ts
SECURITY.password.minLength; // 12
SECURITY.tokens.accessTtlSeconds; // 900
SECURITY.lockout.maxFailedAttempts; // 5
SECURITY.uploads.maxFileSizeBytes; // 10485760
SECURITY.uploads.allowedMimeTypes; // ['image/jpeg', 'image/png', …]
SECURITY.cookies.refreshToken; // 'bb_refresh'
SECURITY.headers.csrfToken; // 'x-csrf-token'
```

The full list is on the [Security](/api/security) page. Nothing here is secret: it ships in the
browser bundle.

## Utilities

Small, dependency-free and tested. Use them on either side.

### Formatting

```ts
formatCurrency(1234.5); // '$1,234.50'
formatCurrency(1234.5, { currency: 'PHP', locale: 'en-PH' }); // '₱1,234.50'
formatNumber(1234.5678); // '1,234.57'
formatPercent(0.125); // '12.5%'
formatBytes(1536); // '1.5 KB'
```

`formatPercent` takes a fraction, not a percentage. For dates, use `formatDate` from
[`@bossbyte/ui`](/packages/ui#dates).

### Strings

```ts
slugify('Héllo Wörld!'); // 'hello-world'
capitalize('admin'); // 'Admin'
truncate('A very long title', 10); // cut to 10 characters, ending with an ellipsis
initials('Ada Lovelace'); // 'AL'
maskEmail('ada@example.com'); // 'a••@example.com'
```

### Collections

```ts
chunk([1, 2, 3, 4, 5], 2); // [[1, 2], [3, 4], [5]]
groupBy(users, (user) => user.role); // { admin: [...], viewer: [...] }
uniqueBy(users, (user) => user.email); // first one seen for each email
sortBy(users, (user) => user.name); // a sorted copy; pass 'desc' as the third argument
pick(user, ['id', 'email']); // { id, email }
omit(user, ['phone']); // everything but phone
range(3); // [0, 1, 2]
range(2, 5); // [2, 3, 4]
```

None of them changes its input.

### Async

```ts
await sleep(500);

const data = await retry(() => fetchRates(), {
  attempts: 4,
  baseDelayMs: 250,
  shouldRetry: (error) => !isClientError(error),
});

const result = await withTimeout(slowCall(), 5_000, 'The rates service did not answer');
```

`retry` waits `baseDelayMs` before the second attempt and doubles the wait after each failure, up
to `maxDelayMs`. The defaults are 3 attempts, 200 ms and 5 seconds. The task receives the attempt
number, starting at 1.

`withTimeout` rejects after the time is up but cannot cancel the underlying work. Pass an
`AbortSignal` to the work itself if it must stop.

### Guards and numbers

```ts
invariant(user, 'User must be loaded here'); // throws if falsy, and narrows the type
const present = items.filter(isDefined); // removes null and undefined, with the right type

clamp(page, 1, totalPages);
round(12.3456, 2); // 12.35
```

`assertNever` makes a `switch` exhaustive. Add a member to the union and the compiler flags every
switch that does not handle it:

```ts
switch (status) {
  case 'queued':
  case 'active':
    return 'Working…';
  case 'completed':
    return 'Done';
  case 'failed':
    return 'Failed';
  default:
    return assertNever(status);
}
```

### Pagination

```ts
paginationOffset(3, 20); // 40, for SQL OFFSET
buildPaginationMeta(95, 3, 20); // { page: 3, pageSize: 20, total: 95, totalPages: 5 }
```

### Result

For functions where failure is an expected outcome and not an exception:

```ts
import { err, ok, type Result } from '@bossbyte/shared';

function parsePort(input: string): Result<number, string> {
  const port = Number(input);
  return Number.isInteger(port) && port > 0 ? ok(port) : err('Not a valid port');
}

const result = parsePort('4000');
if (result.ok) listen(result.value);
else console.error(result.error);
```

## Add to the package

1. Put a schema in the matching file under `packages/shared/src/schemas/` (or add a file and
   re-export it from `schemas/index.ts`). Export the inferred type next to it.
2. Put a helper in the matching file under `utils/`. It is exported automatically.
3. Add cases to `schemas/schemas.test.ts` or `utils/utils.test.ts`.

```bash
npm run test -w @bossbyte/shared
```

Two rules keep the package usable everywhere:

- **No Node or browser APIs.** No `fs`, no `window`, no `process.env`. If it needs the platform,
  it belongs in an app.
- **No secrets.** Everything here ends up in the browser bundle.
