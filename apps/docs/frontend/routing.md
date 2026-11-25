# Routing

The dashboard uses TanStack Router with file-based routes. A file in `apps/core/src/routes/`
is a page, the file's path is the URL, and links, params and search params are type-checked
against the routes that exist.

## The routes

| File                           | URL          | Who can open it                                  |
| ------------------------------ | ------------ | ------------------------------------------------ |
| `__root.tsx`                   | —            | Wraps every page. Adds the toast provider        |
| `login.tsx`                    | `/login`     | Signed-out visitors. Signed-in users are sent on |
| `register.tsx`                 | `/register`  | Signed-out visitors. Signed-in users go to `/`   |
| `_authenticated.tsx`           | —            | The guard and the app shell for everything below |
| `_authenticated/index.tsx`     | `/`          | Any signed-in user                               |
| `_authenticated/users.tsx`     | `/users`     | `users:read`                                     |
| `_authenticated/files.tsx`     | `/files`     | `files:read`                                     |
| `_authenticated/map.tsx`       | `/map`       | Any signed-in user                               |
| `_authenticated/valuation.tsx` | `/valuation` | `valuation:run`                                  |
| `_authenticated/reports.tsx`   | `/reports`   | `reports:read`                                   |
| `_authenticated/settings.tsx`  | `/settings`  | Any signed-in user                               |

A name that starts with an underscore, like `_authenticated`, is a layout route. It adds no
segment to the URL. It wraps the routes in the folder of the same name, so they share its guard
and its layout.

## The generated route tree

The router plugin in `vite.config.ts` reads the `routes/` folder and writes
`src/routeTree.gen.ts`. It does this when the dev server starts, whenever a route file changes
while it runs, and on every build.

```ts
tanstackRouter({ target: 'react', autoCodeSplitting: true }),
```

Do not edit `routeTree.gen.ts`. Keep it in version control, though: type checking needs it, and
on a fresh clone nothing has generated it yet.

`autoCodeSplitting` puts each route's component in its own chunk. The route's `beforeLoad`,
`loader` and search validation stay in the main bundle, because the router needs them before it
can show the page.

## The router

`src/router.tsx` creates the one router:

```ts
export const router = createRouter({
  routeTree,
  // Available to every route's `beforeLoad` and `loader`.
  context: { queryClient, auth: authStore },
  defaultPreload: 'intent',
  // Loaders only warm the TanStack Query cache, which has its own freshness rules.
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
  defaultNotFoundComponent: NotFound,
  defaultErrorComponent: ErrorFallback,
});
```

| Option                       | What it means here                                                           |
| ---------------------------- | ---------------------------------------------------------------------------- |
| `context`                    | Every `beforeLoad` and `loader` receives the query client and the auth store |
| `defaultPreload: 'intent'`   | Hovering or focusing a link loads that route's code and runs its loader      |
| `defaultPreloadStaleTime: 0` | The router keeps no cache of its own. TanStack Query decides what is fresh   |
| `scrollRestoration`          | Going back returns you to where you had scrolled to                          |
| `defaultNotFoundComponent`   | `components/NotFound.tsx`, for a URL no route matches                        |
| `defaultErrorComponent`      | `components/ErrorFallback.tsx`, when a route throws                          |

The `declare module` block below it registers the router's type. That is what makes
`<Link to="/usres">` a compile error.

## Add a page

Create `src/routes/_authenticated/notes.tsx`. The `notes` resource is the example from
[Add a module end to end](/guide/conventions#add-a-module-end-to-end), which also adds the
`notes:read` permission this page checks.

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { PageHeader } from '@/components/PageHeader';
import { RequirePermission } from '@/components/RequirePermission';

export const Route = createFileRoute('/_authenticated/notes')({ component: NotesPage });

function NotesPage() {
  return (
    <RequirePermission permission="notes:read" pageTitle="Notes">
      <PageHeader title="Notes" description="Short notes anyone on the team can read." />
    </RequirePermission>
  );
}
```

With the dev server running, the route tree regenerates and `/notes` works. The string
passed to `createFileRoute` has to match the file's path. The plugin fills it in for a new file
and corrects it if you move one.

Because the file is under `_authenticated/`, the page is already behind the sign-in guard and
inside the app shell. To make a page public, put it next to `login.tsx` instead.

Then add it to the navigation. `NAV_ITEMS` in `src/components/AppShell.tsx` is the list:

```ts
const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard' },
  { to: '/users', label: 'Users', permission: 'users:read' },
  // ...
  { to: '/notes', label: 'Notes', permission: 'notes:read' },
];
```

An item with a `permission` is left out for roles that do not hold it. `to` is typed, so a path
that is not a route does not compile.

## The sign-in guard

`_authenticated.tsx` protects every route under it:

```tsx
export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ context, location }) => {
    if (!(await context.auth.restore())) {
      throw redirect({ to: '/login', search: loginSearch(location.href) });
    }
  },
  component: AuthenticatedLayout,
});
```

`beforeLoad` runs before any child route loads. `restore()` tries once to renew the session
from the refresh cookie and resolves to the user or `null`. Later calls return the same result
without another request, so the guard costs nothing after the first page. See
[Sessions and permissions](/frontend/auth).

A visitor who is not signed in goes to `/login?redirect=<where they were>`. The `redirect`
param is left off when they were heading for `/`.

`beforeLoad` only runs on navigation. `AuthenticatedLayout` therefore also watches the auth
status in an effect, and navigates to `/login` if the session ends while a page is open: the
user signed out, or the refresh token expired. After a deliberate sign-out it does not add the
`redirect` param.

The guard checks that someone is signed in. It does not check permissions. Pages do that with
[`RequirePermission`](/frontend/auth#permissions), and the API enforces them whatever the
dashboard shows.

## After sign-in

`login.tsx` validates its one search param and sends signed-in users on:

```tsx
const loginSearchSchema = z.object({
  /** Where to go after signing in. Checked with `safeRedirectPath` before use. */
  redirect: z.string().optional().catch(undefined),
});

export const Route = createFileRoute('/login')({
  validateSearch: loginSearchSchema,
  beforeLoad: async ({ context, search }) => {
    if (await context.auth.restore()) throw redirect({ href: safeRedirectPath(search.redirect) });
  },
  component: LoginPage,
});
```

The `redirect` value comes from the URL, so anyone can put anything in it.
`safeRedirectPath` (`src/lib/redirect.ts`) only accepts a path inside the app:

```ts
safeRedirectPath('/users?page=2'); // '/users?page=2'
safeRedirectPath('https://evil.test'); // '/'
safeRedirectPath('//evil.test'); // '/'
safeRedirectPath('/login'); // '/'
```

Use it for any redirect target you read from a URL.

## Loaders

A loader here does not return data. It starts the request and puts the result in the TanStack
Query cache, and the component reads it from there with `useQuery`:

```tsx
export const Route = createFileRoute('/_authenticated/')({
  // Starts the request as soon as the link is hovered, without holding up navigation.
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery(statsQueryOptions);
  },
  component: DashboardPage,
});

function DashboardPage() {
  const stats = useQuery(statsQueryOptions);
  // ...
}
```

Two details matter:

- **`void`, not `await`.** The navigation does not wait for the data. The page appears at once
  with its skeletons, and fills in when the response arrives. With preloading on intent, the
  request has usually started before the click.
- **The same `queryOptions` object in both places.** The loader and the component share one
  cache entry, so the request is made once.

A loader is optional. Most of the example pages have none and simply call `useQuery`.

If a loader needs a permission, check it first, or a role without it fires a request that can
only come back as 403:

```tsx
loader: ({ context, deps }) => {
  if (context.auth.can('users:read')) {
    void context.queryClient.prefetchQuery(usersQueryOptions(deps));
  }
},
```

## Search params as state

The users page keeps its page number, page size, search text, role filter and sort order in the
URL. A filtered view can be bookmarked, shared and reached with the back button.

The schema is in `src/features/users/search.ts`:

```ts
export const USERS_SEARCH_DEFAULTS = {
  page: 1,
  pageSize: 10,
  search: '',
  sortBy: 'createdAt',
  sortOrder: 'desc',
} as const;

export const usersSearchSchema = z.object({
  page: z.number().int().min(1).default(USERS_SEARCH_DEFAULTS.page).catch(1),
  pageSize: z.number().int().min(1).max(100).default(USERS_SEARCH_DEFAULTS.pageSize).catch(10),
  search: z.string().trim().max(120).default(USERS_SEARCH_DEFAULTS.search).catch(''),
  role: roleSchema.optional().catch(undefined),
  sortBy: z
    .enum(['name', 'email', 'createdAt'])
    .default(USERS_SEARCH_DEFAULTS.sortBy)
    .catch('createdAt'),
  sortOrder: sortOrderSchema.default(USERS_SEARCH_DEFAULTS.sortOrder).catch('desc'),
});
```

`.default()` fills in a param that is missing. `.catch()` replaces one that is invalid, so a
hand-edited `?page=banana` shows page 1 instead of an error page.

The route wires it up:

```tsx
export const Route = createFileRoute('/_authenticated/users')({
  validateSearch: usersSearchSchema,
  // Keeps the URL short: a param that is at its default is left out.
  search: { middlewares: [stripSearchParams(USERS_SEARCH_DEFAULTS)] },
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => {
    if (context.auth.can('users:read')) {
      void context.queryClient.prefetchQuery(usersQueryOptions(deps));
    }
  },
  component: UsersPage,
});
```

- `validateSearch` parses the URL into a typed object.
- `stripSearchParams` removes values that equal the default, so the plain list is `/users` and
  not `/users?page=1&pageSize=10&...`.
- `loaderDeps` tells the router the loader depends on the search params, so it runs again when
  they change.

In the component, read the params with `Route.useSearch()` and change them by navigating:

```tsx
const search = Route.useSearch();
const navigate = Route.useNavigate();

function updateSearch(patch: Partial<UsersSearch>, { replace = false } = {}) {
  void navigate({ search: (previous) => ({ ...previous, ...patch }), replace });
}

// A new filter or sort goes back to the first page.
updateSearch({ role: 'manager', page: 1 });
```

The search object is also the query key (`usersQueryOptions(search)`), so changing the URL is
what fetches the next page.

### A search box that updates the URL

Writing to the URL on every keystroke would add a history entry per letter and fire a request
each time. `useDebouncedInput` (`src/lib/use-debounced-input.ts`) keeps the input responsive
and commits the trimmed text after a 300 ms pause:

```tsx
const [searchText, setSearchText] = useDebouncedInput(search.search, (value) =>
  updateSearch({ search: value, page: 1 }, { replace: true }),
);

<TextField
  label="Search"
  type="search"
  value={searchText}
  onChange={(event) => setSearchText(event.target.value)}
/>;
```

`replace: true` swaps the current history entry, so the back button leaves the page instead of
undoing the search one step at a time. If the param changes from outside, through the back
button for instance, the input follows it.

## Links and navigation

```tsx
import { Link, useNavigate } from '@tanstack/react-router';

<Link to="/users" search={{ role: 'admin' }}>
  Administrators
</Link>;

const navigate = useNavigate();
void navigate({ to: '/settings' });
```

Both are type-checked: `to` must be a route, and `search` must fit that route's schema.
`navigate` returns a promise. The codebase writes `void` in front of it wherever the result is
not awaited, to show that this is on purpose.

A `Link` to the current page gets `aria-current="page"`. The sidebar styles its active item
from that attribute, with the Tailwind variant `aria-[current=page]:`.

## Titles, focus and scroll

A single-page app has to do by hand what a full page load does for free.

- **Title.** `PageHeader` renders `<title>Users · BossByte</title>`, and React 19 moves it into
  `<head>`. `NotFound` and `ErrorFallback` set their own.
- **Focus.** After a navigation, `AppShell` moves focus to the `<main>` element. Without this,
  keyboard and screen reader users would stay on the link they just followed. A "Skip to
  content" link is the first focusable element on every page.
- **Scroll.** `scrollRestoration: true` on the router.

If you replace `AppShell`, keep the first two.

## Errors and missing pages

| Situation                                 | What the user sees                                                                  |
| ----------------------------------------- | ----------------------------------------------------------------------------------- |
| No route matches the URL                  | `NotFound`: "Page not found" and a link to the dashboard                            |
| A route throws while loading or rendering | `ErrorFallback`: the message, the request ID if the API sent one, and **Try again** |
| A query fails                             | Whatever the page renders. The examples use `QueryError` in place of the content    |

**Try again** in `ErrorFallback` resets the error boundary and calls `router.invalidate()`,
which runs the loaders again.

Because loaders here do not await their requests, a failed request reaches the component as
`query.isError`, not the error boundary. Handle it in the page:

```tsx
if (users.isError) {
  return <QueryError error={users.error} onRetry={() => void users.refetch()} />;
}
```

## Devtools

In development, the root route loads `src/components/Devtools.tsx`: the TanStack Query devtools
button in the bottom-left corner and the Router devtools in the bottom-right. They are not part
of a production build.
