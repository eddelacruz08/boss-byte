# @bossbyte/ui

The in-house React component library: accessible building blocks styled with Tailwind CSS 4, on
top of Headless UI, TipTap, Framer Motion, react-datepicker and dayjs. It lives in `packages/ui`
and is yours to change.

```tsx
import { Button, Card, DataTable, useToast } from '@bossbyte/ui';
```

Everything is exported from the package root. There is no build step: the app that imports it
compiles the TypeScript source.

## Setup in an app

`apps/core` is already set up. For a new app:

**1. Depend on the package** in the app's `package.json`:

```json
{
  "dependencies": {
    "@bossbyte/ui": "*"
  }
}
```

**2. Add the Tailwind plugin** to `vite.config.ts`. Tailwind 4 has no `tailwind.config.js` and no
PostCSS setup:

```ts
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
});
```

**3. Import the styles** once, in the app's main CSS file, after Tailwind itself:

```css
@import 'tailwindcss';
@import '@bossbyte/ui/styles.css';
```

That one import does four things:

- pulls in the react-datepicker stylesheet, with overrides to match the brand
- declares `@source "./"`, so your app's Tailwind build sees the class names used inside the
  package (without it the components would render unstyled)
- defines the theme: the `Inter` font stack and the `brand` colour scale
- defines `.bb-prose`, the typography for rich text

**4. Mount the toast provider** once, near the root:

```tsx
import { ToastProvider } from '@bossbyte/ui';

<ToastProvider>
  <App />
</ToastProvider>;
```

### Theme

The brand colour is a Tailwind theme variable, so it works in any utility: `bg-brand-600`,
`text-brand-700`, `ring-brand-500`. To rebrand, change the scale in
`packages/ui/src/styles.css`:

```css
@theme {
  --color-brand-500: #7057f5;
  --color-brand-600: #5b3ae8;
  /* …50 to 950 */
}
```

Or override it for one app by declaring the same variables in that app's CSS after the import.

## Forms

### Button

```tsx
<Button onClick={save}>Save</Button>

<Button variant="danger" size="sm" loading={isDeleting} onClick={remove}>
  Delete
</Button>

<Button type="submit" fullWidth leftIcon={<PlusIcon />}>
  Add user
</Button>
```

| Prop                    | Type                                                           | Default     |
| ----------------------- | -------------------------------------------------------------- | ----------- |
| `variant`               | `'primary' \| 'secondary' \| 'outline' \| 'ghost' \| 'danger'` | `'primary'` |
| `size`                  | `'sm' \| 'md' \| 'lg'`                                         | `'md'`      |
| `loading`               | `boolean`. Shows a spinner and blocks clicks                   | `false`     |
| `leftIcon`, `rightIcon` | `ReactNode`                                                    |             |
| `fullWidth`             | `boolean`                                                      | `false`     |

It accepts every native `<button>` attribute. `type` defaults to `'button'`, not the browser's
`'submit'`, so a button inside a form does not submit it by accident. Set `type="submit"` on the
one that should.

### TextField

A labelled input with its error and hint wired up. This is the one you will use most.

```tsx
<TextField
  label="Email"
  type="email"
  autoComplete="email"
  hint="We never share it."
  error={errors.email?.message}
  {...register('email')}
/>
```

| Prop    | Type        | Notes                                          |
| ------- | ----------- | ---------------------------------------------- |
| `label` | `ReactNode` | Required                                       |
| `error` | `string`    | Shown under the field; marks the input invalid |
| `hint`  | `ReactNode` | Shown under the field when there is no error   |

Plus every native `<input>` attribute, including `ref`, so it works with react-hook-form's
`register`.

### Input, Textarea and FormField

The pieces `TextField` is made of, for when you need a different control inside the same label
and error layout.

```tsx
<FormField label="Notes" htmlFor="notes" hint="Markdown is fine." error={errors.notes?.message}>
  <Textarea id="notes" rows={6} invalid={Boolean(errors.notes)} {...register('notes')} />
</FormField>
```

- `Input` and `Textarea` take the native attributes plus `invalid`, which styles the control as
  errored and sets `aria-invalid`. `Textarea` defaults to four rows.
- `FormField` takes `label`, `htmlFor` (the id of the control inside it), and optionally `error`,
  `hint`, `required` and `className`. It renders the hint with the id `<htmlFor>-hint` and the
  error with `<htmlFor>-error`; point the control's `aria-describedby` at them.

### Select

A listbox (Headless UI) for a fixed set of options. It is generic over the value type.

```tsx
import { ROLE_LABELS, ROLES, type Role } from '@bossbyte/shared';
import { Select } from '@bossbyte/ui';

const options = ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] }));

<Select<Role> label="Role" options={options} value={role} onChange={setRole} />;
```

| Prop          | Type                                                       | Default     |
| ------------- | ---------------------------------------------------------- | ----------- |
| `options`     | `{ value: T; label: string; disabled?: boolean }[]`        | Required    |
| `value`       | `T \| null`                                                | Required    |
| `onChange`    | `(value: T) => void`                                       | Required    |
| `label`       | `ReactNode`                                                |             |
| `placeholder` | `string`                                                   | `'Select…'` |
| `error`       | `string`                                                   |             |
| `disabled`    | `boolean`                                                  |             |
| `aria-label`  | `string`. Names the control when there is no visible label |             |

`T` is a `string` or a `number`. It is a controlled component: with react-hook-form, wrap it in a
`Controller`. See [Forms](/frontend/forms#select).

### Checkbox and Switch

Same props, different look. Use a checkbox for a choice that takes effect on submit and a switch
for one that takes effect at once.

```tsx
<Checkbox
  checked={agreed}
  onChange={setAgreed}
  label="I accept the terms"
  description="You can withdraw at any time."
/>

<Switch checked={isActive} onChange={setIsActive} label="Active" />
```

| Prop          | Type                                   |
| ------------- | -------------------------------------- |
| `checked`     | `boolean`. Required                    |
| `onChange`    | `(checked: boolean) => void`. Required |
| `label`       | `ReactNode`. Required                  |
| `description` | `ReactNode`                            |
| `disabled`    | `boolean`                              |

### DatePicker

```tsx
<DatePicker
  label="Effective date"
  value={date}
  onChange={setDate}
  minDate={new Date()}
  error={errors.date?.message}
/>
```

| Prop                 | Type                           | Default           |
| -------------------- | ------------------------------ | ----------------- |
| `value`              | `Date \| null`                 | Required          |
| `onChange`           | `(date: Date \| null) => void` | Required          |
| `label`              | `ReactNode`                    |                   |
| `error`              | `string`                       |                   |
| `minDate`, `maxDate` | `Date`                         |                   |
| `placeholder`        | `string`                       | `'Select a date'` |
| `dateFormat`         | `string`                       | `'MMM d, yyyy'`   |
| `disabled`           | `boolean`                      |                   |

`dateFormat` is a **date-fns** pattern, because that is what react-datepicker uses. The
`formatDate` helper below uses **dayjs** patterns. They differ: `d` against `D`, `yyyy` against
`YYYY`.

### RichTextEditor

A TipTap editor with a toolbar: bold, italic, strikethrough, two heading levels, bullet and
numbered lists, quote, undo and redo. The value is an HTML string.

```tsx
const [html, setHtml] = useState('<p>Hello</p>');

<RichTextEditor label="Notes" value={html} onChange={setHtml} placeholder="Write something…" />;
```

| Prop          | Type                     | Notes                      |
| ------------- | ------------------------ | -------------------------- |
| `value`       | `string`                 | Required. HTML             |
| `onChange`    | `(html: string) => void` | Required                   |
| `label`       | `ReactNode`              |                            |
| `placeholder` | `string`                 |                            |
| `editable`    | `boolean`                | `false` makes it read-only |

::: warning Sanitise before you render
The editor produces HTML, and HTML that came from a user must be cleaned before it goes back into
a page. The dashboard has `sanitizeHtml` (DOMPurify) in `apps/core/src/lib/sanitize.ts`. See
[Rich text](/frontend/forms#rich-text).

```tsx
<div className="bb-prose" dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />
```

`bb-prose` gives the output the same typography it had in the editor. If you store the HTML,
sanitise it on the server too.
:::

## Overlays and navigation

### Modal

```tsx
const dialog = useDisclosure();

<Button onClick={dialog.open}>Invite</Button>

<Modal
  open={dialog.isOpen}
  onClose={dialog.close}
  title="Invite a user"
  description="They will get an email with a link."
  size="md"
  footer={
    <>
      <Button variant="outline" onClick={dialog.close}>
        Cancel
      </Button>
      <Button onClick={send}>Send invite</Button>
    </>
  }
>
  <TextField label="Email" type="email" />
</Modal>;
```

| Prop          | Type                   | Notes                                             |
| ------------- | ---------------------- | ------------------------------------------------- |
| `open`        | `boolean`              | Required                                          |
| `onClose`     | `() => void`           | Required. Called on Escape and on a click outside |
| `title`       | `ReactNode`            | Required. Names the dialog                        |
| `description` | `ReactNode`            |                                                   |
| `footer`      | `ReactNode`            | Right-aligned under the body                      |
| `size`        | `'sm' \| 'md' \| 'lg'` |                                                   |

Focus is trapped inside while it is open and returns to the trigger when it closes.

### ConfirmDialog

A modal for one yes-or-no question.

```tsx
<ConfirmDialog
  open={target !== null}
  onClose={() => setTarget(null)}
  onConfirm={() => deleteFile.mutate(target.id)}
  title="Delete this file?"
  message="This cannot be undone."
  confirmLabel="Delete"
  tone="danger"
  loading={deleteFile.isPending}
/>
```

| Prop                           | Type                                                | Default     |
| ------------------------------ | --------------------------------------------------- | ----------- |
| `open`, `onClose`, `onConfirm` | Required                                            |             |
| `title`, `message`             | `ReactNode`. Required                               |             |
| `confirmLabel`                 | `string`                                            | `'Confirm'` |
| `cancelLabel`                  | `string`                                            | `'Cancel'`  |
| `tone`                         | `'primary' \| 'danger'`                             |             |
| `loading`                      | `boolean`. Keeps the dialog open with a busy button |             |

`onConfirm` does not close the dialog. Close it yourself when the action succeeds.

### Tabs

```tsx
<Tabs
  tabs={[
    { label: 'Profile', content: <ProfileForm /> },
    { label: 'Security', content: <SecurityPanel /> },
    { label: 'Billing', content: null, disabled: true },
  ]}
  onChange={(index) => console.log(index)}
/>
```

`tabs` is a list of `{ label, content, disabled? }`. `defaultIndex` picks the tab that starts
selected. Arrow keys move between tabs.

### DropdownMenu

```tsx
<DropdownMenu
  label="Actions"
  align="end"
  items={[
    { label: 'Edit', onSelect: () => edit(user) },
    { label: 'Delete', onSelect: () => remove(user), danger: true },
  ]}
/>
```

`label` is the content of the trigger button. Each item is
`{ label, onSelect, danger?, disabled? }`. `align` is `'start'` or `'end'` (the default) and says
which edge of the trigger the menu lines up with.

### Pagination

```tsx
<Pagination page={page} totalPages={meta.totalPages} onPageChange={setPage} />
```

`page` starts at 1. Long ranges are shortened with ellipses, keeping the first, last and
neighbouring pages.

## Display

### Card

```tsx
<Card
  title="Users"
  description="Everyone with access."
  actions={<Button size="sm">Add user</Button>}
  padded={false}
>
  <DataTable columns={columns} rows={users} rowKey={(user) => user.id} />
</Card>
```

| Prop           | Type          | Notes                                                                                 |
| -------------- | ------------- | ------------------------------------------------------------------------------------- |
| `title`        | `ReactNode`   |                                                                                       |
| `headingLevel` | `2 \| 3 \| 4` | Heading level of the title. Defaults to 2                                             |
| `description`  | `ReactNode`   |                                                                                       |
| `actions`      | `ReactNode`   | Rendered at the right of the header                                                   |
| `padded`       | `boolean`     | Defaults to `true`. Set `false` when the content has its own padding, such as a table |

### DataTable

A typed table with loading and empty states. Sorting, filtering and paging are yours to add
around it, because they usually belong to the server.

```tsx
import type { User } from '@bossbyte/shared';
import { Badge, DataTable, formatDate, type DataTableColumn } from '@bossbyte/ui';

const columns: DataTableColumn<User>[] = [
  { key: 'name', header: 'Name', cell: (user) => user.name },
  { key: 'role', header: 'Role', cell: (user) => <Badge tone="brand">{user.role}</Badge> },
  {
    key: 'created',
    header: 'Created',
    align: 'right',
    cell: (user) => formatDate(user.createdAt),
  },
];

<DataTable
  columns={columns}
  rows={data?.data ?? []}
  rowKey={(user) => user.id}
  loading={isPending}
  caption="Users"
  emptyMessage="No users match your search."
/>;
```

| Prop           | Type                   | Notes                                                 |
| -------------- | ---------------------- | ----------------------------------------------------- |
| `columns`      | `DataTableColumn<T>[]` | Required. `{ key, header, cell, align?, className? }` |
| `rows`         | `T[]`                  | Required                                              |
| `rowKey`       | `(row: T) => string`   | Required                                              |
| `loading`      | `boolean`              | Shows skeleton rows instead of `rows`                 |
| `emptyMessage` | `string`               | Defaults to `'Nothing to show yet.'`                  |
| `caption`      | `string`               | For screen readers; not shown                         |

### Badge

```tsx
<Badge tone="success">Active</Badge>
```

`tone` is `'neutral'`, `'brand'`, `'success'`, `'warning'`, `'danger'` or `'info'`.

### Alert

```tsx
<Alert tone="warning" title="Two-factor is off" onDismiss={() => setHidden(true)}>
  Turn it on in Settings to protect your account.
</Alert>
```

`tone` is `'info'` (the default), `'success'`, `'warning'` or `'danger'`. Passing `onDismiss` adds
a close button.

### Avatar

```tsx
<Avatar name="Ada Lovelace" src={user.photoUrl} size="lg" />
```

Shows the image when `src` is set, and the person's initials otherwise. `size` is `'sm'`, `'md'`
or `'lg'`.

### EmptyState

```tsx
<EmptyState
  title="No files yet"
  description="Upload a file to get started."
  action={<Button onClick={pick}>Upload</Button>}
/>
```

Takes `title`, and optionally `description`, `action`, `icon` and `className`.

### Spinner and Skeleton

```tsx
<Spinner size="sm" label="Saving" />

<Skeleton className="h-4 w-32" />
```

`Spinner` takes a `size` (`'sm'`, `'md'`, `'lg'`) and a `label` that is read to screen readers
and not shown (it defaults to `'Loading'`). `Skeleton` is a pulsing block; size it with utility
classes.

## Toasts

Wrap the app in `ToastProvider` once, then call `useToast` anywhere below it.

```tsx
import { useToast } from '@bossbyte/ui';

function SaveButton() {
  const { toast } = useToast();

  const save = async () => {
    try {
      await api.patch('/auth/me', values);
      toast({ title: 'Profile saved', tone: 'success' });
    } catch (error) {
      toast({ title: 'Could not save', description: errorMessage(error), tone: 'danger' });
    }
  };

  return <Button onClick={save}>Save</Button>;
}
```

`useToast()` returns `{ toast, dismiss }`.

| Option        | Type                                           | Notes                           |
| ------------- | ---------------------------------------------- | ------------------------------- |
| `title`       | `string`                                       | Required                        |
| `description` | `string`                                       |                                 |
| `tone`        | `'info' \| 'success' \| 'warning' \| 'danger'` |                                 |
| `durationMs`  | `number`                                       | `0` keeps it up until dismissed |

`toast()` returns an id that `dismiss(id)` accepts. `ToastProvider` takes `defaultDurationMs`
for toasts that do not set their own.

## Hooks

### useDisclosure

Open and closed state for a modal, a menu or a panel.

```tsx
const { isOpen, open, close, toggle } = useDisclosure();
```

Pass `true` to start open.

### useDebounce

Returns a value that only updates after it has stopped changing for `delayMs` (300 by default).

```tsx
const [search, setSearch] = useState('');
const debounced = useDebounce(search, 400);

const { data } = useQuery(usersQueryOptions({ ...filters, search: debounced }));
```

### useLocalStorage

`useState`, persisted to `localStorage` as JSON and kept in sync across tabs. If storage is
blocked it falls back to in-memory state.

```tsx
const [pageSize, setPageSize, resetPageSize] = useLocalStorage('users.pageSize', 10);
```

Do not put tokens or personal data in it. `localStorage` is readable by any script on the page.

### useMediaQuery

```tsx
const isDesktop = useMediaQuery('(min-width: 1024px)');
const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
```

### useCopyToClipboard

```tsx
const { copied, copy } = useCopyToClipboard();

<Button onClick={() => copy(secret)}>{copied ? 'Copied' : 'Copy'}</Button>;
```

`copy` resolves to `true` when it worked. `copied` goes back to `false` after two seconds; pass a
different delay in milliseconds to change that.

## Utilities

### cn

Joins class names (`clsx`) and resolves Tailwind conflicts (`tailwind-merge`), so a class passed
in by the caller wins over the component's own.

```tsx
<div className={cn('rounded-lg p-4', isActive && 'bg-brand-50', className)} />
```

### Dates

```ts
formatDate('2026-03-05T14:30:00Z'); // 'Mar 5, 2026'
formatDate(user.createdAt, 'YYYY-MM-DD'); // dayjs format string
formatDateTime(user.lastLoginAt); // 'Mar 5, 2026 2:30 PM'
formatRelativeTime(file.createdAt); // '3 hours ago'
isValidDate(''); // false
```

All accept a `Date`, an ISO string, a timestamp, `null` or `undefined`. A missing or invalid date
gives `'—'`, so a nullable column needs no special case. Times are shown in the browser's time
zone.

### paginationRange

The page list behind `Pagination`, if you want to render your own.

```ts
paginationRange(5, 10);
// [1, 'ellipsis-start', 4, 5, 6, 'ellipsis-end', 10]
```

The third argument is how many neighbours to show on each side of the current page (1 by
default).

## Accessibility

The components are built to be usable with a keyboard and a screen reader: Headless UI supplies
focus management and ARIA for the listbox, menu, tabs, dialog and switch; form fields link their
label, hint and error; the modal and toast animations respect the user's reduced-motion setting.

The test suite checks this with axe. See [Testing](/testing#accessibility-checks).

## Add a component

1. Create `packages/ui/src/components/Thing.tsx`. Export the component and its props type.
   Accept `className` and merge it with `cn`.
2. Export both from `packages/ui/src/index.ts`.
3. Add `Thing.test.tsx` next to it, with at least one behaviour test and one axe check.
4. Document it on this page (`apps/docs/packages/ui.md`).

```bash
npm run test -w @bossbyte/ui
npm run typecheck -w @bossbyte/ui
```

Keep components free of data fetching and app-specific logic. Anything that knows about the API
belongs in `apps/core`.
