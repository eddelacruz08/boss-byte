# Forms

Forms use react-hook-form, validated by the same Zod schemas the API uses. A rule such as "a
password has at least 12 characters" is written once in `@bossbyte/shared`. The form shows it
before the request is sent, and the API enforces it when the request arrives.

## The pattern

`src/features/auth/RegisterForm.tsx` is the shortest complete example:

```tsx
import { registerSchema, type RegisterInput } from '@bossbyte/shared';
import { Alert, Button, TextField } from '@bossbyte/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { errorMessage, isApiError } from '@/lib/api';
import { applyApiFieldErrors } from '@/lib/forms';

export function RegisterForm({ onRegistered }: RegisterFormProps) {
  const { signIn } = useAuth();
  const form = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '' },
  });
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = form;

  const createAccount = useMutation({
    mutationFn: async (values: RegisterInput) => signIn(await authApi.register(values)),
    onSuccess: onRegistered,
    onError: (error) => {
      if (isApiError(error, 'email_taken')) setError('email', { message: error.message });
      else applyApiFieldErrors(error, form);
    },
  });

  const hasFieldError = Object.keys(errors).length > 0;

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={handleSubmit((values) => createAccount.mutate(values))}
    >
      {createAccount.isError && !hasFieldError && (
        <Alert tone="danger">{errorMessage(createAccount.error)}</Alert>
      )}
      <TextField
        label="Email"
        type="email"
        autoComplete="username"
        error={errors.email?.message}
        {...register('email')}
      />
      {/* The name and password fields follow the same shape. */}
      <Button type="submit" fullWidth loading={createAccount.isPending}>
        Create account
      </Button>
    </form>
  );
}
```

The parts, in the order you write them:

1. **`useForm` with `zodResolver(schema)`.** The form's value type is inferred from the schema,
   so `register('emial')` does not compile. Give every field a default value. An input that
   starts as `undefined` makes React warn when it later gets a value.
2. **A mutation for the submit.** It gives you `isPending` for the button and `isError` for the
   message, with no state of your own.
3. **`noValidate` on the `<form>`.** It turns off the browser's validation bubbles, so the only
   messages are the schema's, shown by the fields.
4. **`handleSubmit`.** It runs the schema first. Your callback is called only with valid values,
   and when validation fails react-hook-form moves focus to the first field with an error.
5. **`error={errors.<field>?.message}`** on each field. `TextField` renders the message, marks
   the input invalid and links the two for screen readers. See [Forms](/packages/ui#forms) in
   the UI package.
6. **`loading` on the submit button.** A loading button is disabled, so a double click cannot
   send the form twice.

`Button` renders `type="button"` unless you say otherwise. Only the submit button needs
`type="submit"`, and a Cancel button inside the form needs nothing.

## Errors from the API

The browser's check is a convenience. The API validates again and knows things the browser
cannot, such as whether an email is already taken. A failed submit can end in three places.

**On a field, from the validation details.** When the API rejects the body, its error carries
one entry per field: `details: [{ path: 'email', message: '...' }]`. `applyApiFieldErrors` puts
each message on the form field with the same name:

```ts
onError: (error) => applyApiFieldErrors(error, form),
```

It returns `true` when it placed at least one message, and `false` when there was nothing to
place: the error was not an `ApiError`, it had no details, or no detail matched a field of this
form.

**On a field, from an error code.** Some errors are about one field but are not validation
errors. Map those by code:

```ts
onError: (error) => {
  if (isApiError(error, 'email_taken')) setError('email', { message: error.message });
  else applyApiFieldErrors(error, form);
},
```

The change-password form does the same with `invalid_password` and the `currentPassword` field.

**Above the form.** Everything else, such as a rate limit, a network failure or a 500, is shown
in an `Alert`, and only when no field is showing an error:

```tsx
const hasFieldError = Object.keys(errors).length > 0;

<form noValidate onSubmit={handleSubmit((values) => createAccount.mutate(values))}>
  {createAccount.isError && !hasFieldError && (
    <Alert tone="danger">{errorMessage(createAccount.error)}</Alert>
  )}
  {/* the fields */}
</form>;
```

Without the `!hasFieldError` condition, a taken email would show twice: under the field, and
again as "Validation failed" at the top.

A message set with `setError` is not permanent. The schema runs again when the user edits that
field or submits, and its result replaces the message.

## A schema just for the form

Use the shared schema as it is when the form's fields are the request body. `registerSchema`,
`loginSchema` and `changePasswordSchema` are used that way.

Sometimes the form needs a slightly different shape. The user dialog builds its own from shared
pieces (`src/features/users/UserFormModal.tsx`):

```ts
const createFormSchema = createUserSchema.extend({
  role: roleSchema,
  phone: optionalPhoneSchema,
});

const editFormSchema = z.object({
  name: nameSchema,
  role: roleSchema,
  phone: optionalPhoneSchema,
});
```

Build from the exported field schemas (`nameSchema`, `emailSchema`, `passwordSchema`,
`roleSchema`, `phoneSchema`) so the rules themselves stay in one place. A schema used by one
form only, such as the passkey name on the settings page, can live next to that form.

### Optional text fields

An empty text input gives `''`, never `null`. The API expects `null` for "no phone number", and
`phoneSchema` rejects an empty string. `optionalPhoneSchema` from `@/lib/forms` accepts either
an empty string or a valid number. Convert when you submit:

```ts
createUser.mutate({ ...values, phone: values.phone || null });
```

And convert back when you fill the form from existing data:

```ts
defaultValues: { name: user.name, role: user.role, phone: user.phone ?? '' },
```

Follow the same two steps for any other optional text field you add.

## Other kinds of field

### Select

`Select` from `@bossbyte/ui` is not a native element, so it cannot take `register`. Connect it
with `Controller`:

```tsx
const roleOptions = ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] }));

<Controller
  control={control}
  name="role"
  render={({ field, fieldState }) => (
    <Select
      label="Role"
      options={roleOptions}
      value={field.value}
      onChange={field.onChange}
      error={fieldState.error?.message}
    />
  )}
/>;
```

`control` comes from `useForm`. The same pattern fits any controlled component, including
`RichTextEditor`.

### Numbers

An `<input type="number">` still gives a string. Pass `valueAsNumber` so the schema receives a
number, as the valuation page does:

```tsx
<TextField
  label="Comparables to use"
  type="number"
  inputMode="numeric"
  error={errors.k?.message}
  {...register('k', { valueAsNumber: true })}
/>
```

An empty number input becomes `NaN`, which `z.number()` rejects. Give the schema a message for
that case, because the default one is not written for users:

```ts
k: z
  .number('Enter how many comparables to use')
  .int('Use a whole number')
  .min(1, 'Use at least 1 comparable')
  .max(25, 'Use at most 25 comparables'),
```

### File inputs

A file input is left uncontrolled: read the file from a ref when the form is submitted. The
upload form on the files page (`src/routes/_authenticated/files.tsx`) does not use
react-hook-form at all. It pairs `FileInput` from `@/components/FileInput` with `FormField` from
the UI package:

```tsx
function UploadForm() {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const upload = useUploadFile();
  const [problem, setProblem] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const file = input.current?.files?.[0];
    const invalid = file ? validateUpload(file) : 'Choose a file to upload.';
    setProblem(invalid);
    if (!file || invalid) {
      input.current?.focus();
      return;
    }
    upload.mutate(file, {
      onSuccess: () => {
        if (input.current) input.current.value = '';
      },
      // The API has the final say on type and size; its message says which one failed.
      onError: (error) => setProblem(errorMessage(error)),
    });
  }

  return (
    <form noValidate onSubmit={submit}>
      <FormField label="File" htmlFor={inputId} hint={UPLOAD_HINT} error={problem ?? undefined}>
        <FileInput
          ref={input}
          id={inputId}
          accept={UPLOAD_ACCEPT}
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? `${inputId}-error` : `${inputId}-hint`}
          onChange={(event) => {
            const file = event.target.files?.[0];
            setProblem(file ? validateUpload(file) : null);
          }}
        />
      </FormField>
      <Button type="submit" loading={upload.isPending}>
        Upload
      </Button>
    </form>
  );
}
```

`FormField` renders the hint with the id `<htmlFor>-hint` and the error with `<htmlFor>-error`.
`TextField` wires `aria-describedby` to them for you. With a control of your own, you do it, as
above.

`src/features/files/validate-upload.ts` reads the limits from `SECURITY.uploads`, the same
constants the API checks against:

| Export                 | What it is                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| `validateUpload(file)` | A message when the file is empty, of a type the API refuses, or too big. Otherwise `null` |
| `UPLOAD_ACCEPT`        | The allowed MIME types, for the input's `accept` attribute                                |
| `UPLOAD_HINT`          | A sentence for the field's hint                                                           |

The browser reports a file's type from its extension, so this check saves a round trip and
nothing more. The API checks the file by its content. See
[The upload pipeline](/api/storage#the-upload-pipeline).

### Rich text

`RichTextEditor` takes an HTML string and gives one back:

```tsx
const [notes, setNotes] = useState('<p>Write here.</p>');

<RichTextEditor label="Notes" value={notes} onChange={setNotes} />;
```

Its output is user input like any other. Whenever you render it as HTML, pass it through
`sanitizeHtml` from `@/lib/sanitize` first:

```tsx
// The editor's output is still user input: it is cleaned before it is rendered as HTML.
const preview = useMemo(() => sanitizeHtml(notes), [notes]);

<div className="bb-prose" dangerouslySetInnerHTML={{ __html: preview }} />;
```

`sanitizeHtml` keeps the tags the editor can produce (paragraphs, headings up to level 3,
lists, quotes, code, bold, italic, strikethrough, links) with the attributes `href`, `target`
and `rel`. Everything else is removed: scripts, event handlers, styles, `javascript:` links.
Links that open a new tab get `rel="noopener noreferrer"`.

::: warning Sanitise where you render
Clean the HTML at the point where it is rendered, every time. Do not rely on it having been
cleaned when it was saved. Another client, a script or an import may have written to the same
column.
:::

The `bb-prose` class from the UI package's stylesheet gives the rendered HTML its typography.
The reports page shows the editor and its preview side by side.

## Forms in a dialog

`UserFormModal` takes `open`, `onClose` and an optional `user`. With a user it edits, and
without one it creates. Inside the `Modal` are two separate form components, each with its own
schema and default values:

```tsx
<Modal open={open} onClose={onClose} title={user ? 'Edit user' : 'New user'}>
  {user ? <EditUserForm user={user} onDone={onClose} /> : <CreateUserForm onDone={onClose} />}
</Modal>
```

Two smaller forms are easier to follow than one form full of conditions, because the fields
differ: only the create form has an email and a password.

`Modal` renders its content only while it is open, so every opening mounts a new form with new
default values. There is nothing to reset.

The page keeps the dialog's state as one object:

```tsx
const [form, setForm] = useState<{ open: boolean; user?: User }>({ open: false });

<Button onClick={() => setForm({ open: true })}>New user</Button>;

<UserFormModal
  open={form.open}
  onClose={() => setForm((current) => ({ ...current, open: false }))}
  user={form.user}
/>;
```

Closing only flips `open` and leaves `user` in place. The dialog fades out, and for that moment
it still needs the user to show its title and fields. Clearing `user` at once would make an
"Edit user" dialog flash "New user" on its way out.

Screen-specific reactions go in the `mutate` call, so the form closes only when the save
worked:

```tsx
updateUser.mutate(
  { id: user.id, input: { name, phone: phone || null, ...(isSelf ? {} : { role }) } },
  {
    onSuccess: (updated) => {
      if (isSelf) setUser(updated);
      toast({ title: `${updated.name} was updated`, tone: 'success' });
      onDone();
    },
    onError: (error) => applyApiFieldErrors(error, form),
  },
);
```

When someone edits their own account, the role field is disabled and left out of the request,
because the API refuses a change to your own role. The form also puts the response in the auth
store, so the name in the top bar changes with it.

## Forms that stay on screen

A settings form is not closed after a save, so it has two more jobs. `ProfileForm` shows both:

```tsx
const {
  register,
  handleSubmit,
  reset,
  formState: { errors, isDirty },
} = form;

const save = useMutation({
  mutationFn: authApi.updateProfile,
  onSuccess: (updated) => {
    setUser(updated);
    reset({ name: updated.name, phone: updated.phone ?? '' });
    toast({ title: 'Profile saved', tone: 'success' });
  },
  onError: (error) => applyApiFieldErrors(error, form),
});
```

```tsx
<Button type="submit" loading={save.isPending} disabled={!isDirty}>
  Save profile
</Button>
```

- **`disabled={!isDirty}`** keeps the button off until something has changed.
- **`reset(values)` after a save** makes the saved values the new starting point, so `isDirty`
  goes back to `false`. Reset to what the API returned, not to what was typed. The API trims and
  normalises.

A form whose fields should empty after use calls `reset()` with no arguments. The passkey name
form does, after a passkey is added.

## A second step

When one form replaces another, move the keyboard focus with it. The sign-in form swaps the
password fields for a code field when the account has two-factor on:

```tsx
const {
  register,
  handleSubmit,
  setFocus,
  formState: { errors },
} = useForm({ resolver: zodResolver(mfaCodeSchema), defaultValues: { code: '' } });

// The step replaces the password form, so move the keyboard along with it.
useEffect(() => setFocus('code'), [setFocus]);
```

```tsx
<TextField
  label="Authentication code"
  hint="Enter the 6-digit code from your authenticator app."
  inputMode="numeric"
  autoComplete="one-time-code"
  maxLength={6}
  error={errors.code?.message}
  {...register('code')}
/>
```

`mfaCodeSchema` is `mfaVerifySchema.pick({ code: true })`: the form validates the one field the
user types, and the token from the first step is added when the request is sent.

Set `autoComplete` on every sign-in field. The examples use `username`, `current-password`,
`new-password` and `one-time-code`, which is what lets password managers and phones fill them
in.

## Zod and the Content-Security-Policy

Zod makes object parsing faster by compiling validators with `new Function`, and it tests
whether that is allowed when the first object schema is defined. The dashboard's
Content-Security-Policy does not allow `eval`, so that test would be reported as a violation on
every page load.

`src/lib/zod-config.ts` turns the fast path off:

```ts
z.config({ jitless: true });
```

Form-sized payloads do not need it.

The setting has to be in place before any schema is defined, and schemas are defined when their
module is first evaluated. That is why `src/main.tsx` imports the config and then loads the
rest of the app with a dynamic `import()`:

```ts
import '@/lib/zod-config';

void import('./bootstrap');
```

With two plain imports, the bundler would be free to evaluate a shared chunk of schemas before
the config. Keep `main.tsx` this way, and do not import anything else into it.

The policy itself is set by Nginx in the dashboard's Docker image. See
[HTTP headers](/api/security#http-headers).

## Checklist for a new form

- The schema comes from `@bossbyte/shared`, or is built from its field schemas.
- Every field has a default value.
- The `<form>` has `noValidate`, and the submit button has `type="submit"` and `loading`.
- Each field gets its `error`. `onError` calls `applyApiFieldErrors`, and an `Alert` covers what
  is left.
- Optional text fields convert `''` to `null` on the way out and `null` to `''` on the way in.
- The form has a test. `src/features/auth/LoginForm.test.tsx` is the one to copy. See
  [Component tests](/testing#component-tests).
