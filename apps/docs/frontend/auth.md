# Sessions and permissions

Two files hold everything the dashboard knows about who is signed in: `src/lib/api.ts` keeps
the access token and renews it, and `src/lib/auth.ts` keeps the user. Pages never touch a
token. They call `useAuth()`.

The server side of this is in [Authentication](/api/authentication).

## Where the session lives

| Piece         | Where it is kept                               | Survives a reload |
| ------------- | ---------------------------------------------- | ----------------- |
| Access token  | A variable inside the API client. Memory only  | No                |
| Refresh token | An httpOnly cookie that JavaScript cannot read | Yes               |
| The user      | The auth store, loaded from `GET /auth/me`     | No. Loaded again  |

Nothing is written to `localStorage` or `sessionStorage`. A script injected into the page
cannot read a refresh token it has no access to, and the access token it could reach lasts 15
minutes. See [The token model](/api/authentication#the-token-model).

The cost is one request on every page load to get a new access token. That request is
`restore()`.

## The life of a session

**On load.** The first route guard calls `authStore.restore()`. It sends `POST /auth/refresh`
with the cookie. If the API answers with an access token, the store loads the user from
`GET /auth/me` and the status becomes `authenticated`. If not, it becomes `unauthenticated` and
the guard redirects to `/login`. `restore()` does this once. Every later call returns the same
result.

If the API cannot be reached at all, `restore()` also resolves to `null`. The visitor lands on
the sign-in page, and the error shows there when they try to sign in.

**Sign-in.** Each sign-in method ends with the API returning `{ accessToken, expiresIn }` and
setting the refresh cookie. The form passes that to `signIn(tokens)`, which stores the token
and loads the user.

**While signed in.** When a request comes back 401, the API client renews the access token and
repeats the request once. The page never notices. See
[Expired access tokens](/frontend/api-client#expired-access-tokens).

**When the session cannot be renewed.** The refresh token has expired or was revoked. The API
client calls the handler the auth store registered, the store clears itself, and the layout
route sends the user to `/login?redirect=<where they were>`.

**Sign-out.** `signOut()` sends `POST /auth/logout`, which revokes the refresh token and clears
the cookie, and then clears the store. The local session ends even if that request fails.

**Every time the session ends**, `src/bootstrap.tsx` empties the TanStack Query cache:

```ts
// Cached responses belong to whoever was signed in; the next person must not see them.
authStore.subscribe(() => {
  if (authStore.getState().status === 'unauthenticated') queryClient.clear();
});
```

## `useAuth`

```tsx
import { useAuth } from '@/lib/auth';

const { status, user, can, signOut } = useAuth();
```

| Field         | Type                                                | Use                                                     |
| ------------- | --------------------------------------------------- | ------------------------------------------------------- |
| `status`      | `'unknown' \| 'authenticated' \| 'unauthenticated'` | `unknown` until `restore()` has finished                |
| `user`        | `User \| null`                                      | The signed-in user                                      |
| `can`         | `(permission) => boolean`                           | Whether the user's role holds a permission              |
| `signIn`      | `(tokens) => Promise<User>`                         | Finish a sign-in. The sign-in forms call it             |
| `signOut`     | `() => Promise<void>`                               | End the session on the server and locally               |
| `clear`       | `() => void`                                        | Forget the session locally. The server already ended it |
| `refreshUser` | `() => Promise<User>`                               | Load the user again from `GET /auth/me`                 |
| `setUser`     | `(user) => void`                                    | Replace the user with one you already have              |

Components re-render when the session changes. The hook reads the store with
`useSyncExternalStore`.

### `useCurrentUser`

Inside a page under `_authenticated/` there is always a user. `useCurrentUser()` returns it as
`User`, not `User | null`, so you can skip the null check:

```tsx
import { useCurrentUser } from '@/lib/auth';

const me = useCurrentUser();
const isSelf = user.id === me.id;
```

It throws if it is rendered outside an authenticated route.

### Outside React

The store is a plain object, so code that is not a component can use it. Route guards and
loaders get it as `context.auth`:

```tsx
beforeLoad: async ({ context }) => {
  if (!(await context.auth.restore())) throw redirect({ to: '/login' });
},
loader: ({ context }) => {
  if (context.auth.can('users:read')) void context.queryClient.prefetchQuery(/* ... */);
},
```

Anywhere else, import `authStore` from `@/lib/auth`.

## Permissions

The user object carries a `role`. What a role may do is defined once, in `@bossbyte/shared`, and
both the API and the dashboard read it from there. See
[Roles and permissions](/api/authorization#roles-and-permissions).

::: warning The dashboard hides, the API enforces
Everything on this page decides what to _show_. It protects nothing. Anyone can call the API
directly, so every protected route checks the permission on the server.
:::

There are four places a permission is checked in the dashboard.

**A whole page.** Wrap the page in `RequirePermission` and pass `pageTitle`, so a role without
access still gets a heading and a tab title above the "You do not have access to this" notice:

```tsx
function UsersPage() {
  return (
    <RequirePermission permission="users:read" pageTitle="Users">
      <UsersList />
    </RequirePermission>
  );
}
```

Put the hooks that fetch data in the inner component (`UsersList` here). Then a role without
access never sends the request.

**Part of a page.** Pass `fallback={null}` to show nothing in its place:

```tsx
<RequirePermission permission="users:write" fallback={null}>
  <ImportCheck />
</RequirePermission>
```

**A single button or column.** Use `can`:

```tsx
const { can } = useAuth();

<>{can('users:write') && <Button onClick={openCreate}>New user</Button>}</>;
```

**The navigation.** An item in `NAV_ITEMS` (`src/components/AppShell.tsx`) with a `permission`
is left out for roles without it.

`can` and `RequirePermission` take the `Permission` type from `@bossbyte/shared`, so a
misspelled permission does not compile. To add one, see
[Add a permission](/api/authorization#add-a-permission).

The role in the store is as old as the last `GET /auth/me`. If an administrator changes your
role, the API revokes your refresh tokens, so your session ends within 15 minutes and the new
role applies when you sign in again.

## The sign-in page

`src/features/auth/LoginForm.tsx` is the whole flow. The route only decides where to go
afterwards:

```tsx
<LoginForm
  onSignedIn={() =>
    void router.navigate({ href: safeRedirectPath(search.redirect), replace: true })
  }
/>
```

The form offers up to three ways in.

| Method   | Shown when                                                         | What happens                                                  |
| -------- | ------------------------------------------------------------------ | ------------------------------------------------------------- |
| Password | Always                                                             | `POST /auth/login`. May ask for a second step                 |
| Passkey  | The browser supports WebAuthn (`isPasskeySupported()`)             | Options from the API, the browser's prompt, then verify       |
| Google   | All four `VITE_FIREBASE_*` values are set (`isFirebaseConfigured`) | Firebase pop-up, then `POST /auth/firebase` with the ID token |

All three run through one mutation, so only one can be in flight and the other buttons are
disabled while it is.

**The second step.** When an account has two-factor on, password and Google sign-in answer with
`{ mfaRequired: true, mfaToken }` instead of tokens. The form swaps to a field for the 6-digit
code, moves focus to it, and sends `POST /auth/mfa/verify`. The `mfaToken` stays in component
state and is gone on reload. A passkey sign-in never asks for a code.

**Dismissed prompts.** Closing the passkey prompt or the Google pop-up is not an error, and
shows no message. `isPasskeyPromptDismissed` and `isPopupDismissed` detect those cases.

**Google and Firebase.** `signInWithGoogle()` (`src/lib/firebase.ts`) imports the Firebase SDK
when the button is first pressed, opens the pop-up, takes the ID token and signs out of Firebase
again at once. Firebase only proves who the user is. The session is BossByte's. The API has to
be configured for the same Firebase project. See
[Google sign-in through Firebase](/api/authentication#google-sign-in-through-firebase).

**Sign-in endpoints use cookies, not the Bearer header.** The calls in
`src/features/auth/api.ts` that run before there is a session pass `{ anonymous: true }`, which
makes the API client send a CSRF token instead. See [CSRF](/frontend/api-client#csrf).

### Registration

`src/features/auth/RegisterForm.tsx` posts to `/auth/register`. The API answers with tokens,
so the new user is signed in straight away and sent to `/`. New accounts get the `viewer` role.

To turn self-registration off, remove `src/routes/register.tsx` and the link to it in
`login.tsx`, and remove or guard the API route as well. The dashboard change alone only hides
the form.

## The settings page

`src/routes/_authenticated/settings.tsx` has four tabs. Each is one component in
`src/features/settings/`.

| Tab        | Component            | Notes                                                              |
| ---------- | -------------------- | ------------------------------------------------------------------ |
| Profile    | `ProfileForm`        | `PATCH /auth/me`. Puts the response in the store with `setUser`    |
| Password   | `ChangePasswordForm` | The API revokes every session, so the form then calls `clear()`    |
| Two-factor | `TwoFactorPanel`     | Setup shows a QR code and the key, then asks for a code to confirm |
| Passkeys   | `PasskeysPanel`      | Lists, adds and removes passkeys                                   |

Two of them show a pattern worth copying.

**After a password change, sign out locally.** The API has already revoked the refresh token,
this device's included. Calling `clear()` drops the access token and sends the user to the
sign-in page now, instead of at the next failed request:

```tsx
const { clear } = useAuth();

const change = useMutation({
  mutationFn: authApi.changePassword,
  onSuccess: () => {
    toast({
      title: 'Password changed',
      description: 'Sign in again with your new password.',
      tone: 'success',
    });
    // The API has revoked every session, this one included.
    clear();
  },
});
```

Use `clear()`, not `signOut()`, when the server ended the session. There is nothing left to
revoke.

**Keep the stored user in step.** The shell shows the user's name, and the settings page shows
whether two-factor is on. When a change affects the user object, update the store:

- The response _is_ the user: call `setUser(updated)`. The profile form does, and so does the
  user edit form when you edit your own account.
- The response is something else: call `refreshUser()`. Turning two-factor on or off changes
  `user.totpEnabled`, and adding or removing a passkey changes `user.passkeyCount`.

```tsx
const { refreshUser } = useAuth();

const enable = useMutation({
  mutationFn: async (code: string) => {
    await authApi.totpEnable({ code });
    await refreshUser();
  },
});
```

## Testing code that needs a session

`createAuthStore(client)` and `createApiClient(baseUrl)` are factories, so a test can build its
own pair against a mocked `fetch`. `src/lib/auth.test.ts` and `src/lib/api.test.ts` do that. See
[Dashboard helpers](/testing#dashboard-helpers).
