# API client and data

Every request the dashboard makes goes through one object, `api`, in `src/lib/api.ts`. It adds
the access token, handles CSRF, renews an expired session and turns every failure into one
error type. TanStack Query sits on top of it for caching.

## Making a request

```ts
import type { User, UserList } from '@bossbyte/shared';
import { api } from '@/lib/api';

const users = await api.get<UserList>('/users', { query: { page: 1, search: 'ada' } });
const created = await api.post<User>('/users', input);
const updated = await api.patch<User>(`/users/${id}`, { name: 'Ada Lovelace' });
await api.delete(`/users/${id}`);
```

Paths are relative to the base URL, which is `VITE_API_URL` or `/api/v1`.

| Method                                | Sends                 | Resolves to                                    |
| ------------------------------------- | --------------------- | ---------------------------------------------- |
| `api.get<T>(path, options?)`          | —                     | The JSON body as `T`                           |
| `api.post<T>(path, body?, options?)`  | JSON                  | The JSON body, or `undefined` for a 204        |
| `api.patch<T>(path, body, options?)`  | JSON                  | The JSON body                                  |
| `api.delete<T>(path, options?)`       | —                     | `undefined` for a 204, otherwise the JSON body |
| `api.upload<T>(path, form, options?)` | `multipart/form-data` | The JSON body                                  |
| `api.download(path, options?)`        | —                     | `{ blob, fileName }`                           |

The options are the same for all of them:

| Option      | What it does                                                                 |
| ----------- | ---------------------------------------------------------------------------- |
| `query`     | Appended to the URL. `null`, `undefined` and empty strings are left out      |
| `signal`    | An `AbortSignal`. Pass the one TanStack Query gives you                      |
| `anonymous` | Never send the access token. For the endpoints that work on the cookie alone |

The type parameter is a promise from you, not a check. The client does not validate responses
at run time. Use the types from `@bossbyte/shared`, which are inferred from the same schemas
the API uses to build its responses.

`query` dropping empty values is what lets you pass a search object straight through:
`{ page: 1, search: '', role: undefined }` becomes `?page=1`.

## What the client does for you

### The access token

After sign-in the auth store calls `api.setAccessToken(token)`. From then on every request
carries `Authorization: Bearer <token>`. The token is a variable in the client's closure and is
never stored anywhere else. See [Sessions and permissions](/frontend/auth).

Every request also goes out with `credentials: 'include'`, so the cookies travel with it.

## CSRF

A request with a Bearer header is exempt from CSRF checks on the API. A request without one that
changes state is not: sign-in, registration, refresh and sign-out. Those run on cookies, and the
API wants an `x-csrf-token` header with them. See [CSRF](/api/security#csrf) for why.

The client handles it:

- Before the first non-`GET` request without a Bearer header, it calls `GET /auth/csrf-token`
  and keeps the token. Requests made at the same time share that one call.
- It sends the token in the header named by `SECURITY.headers.csrfToken`.
- If the API answers `invalid_csrf_token`, it fetches a new token and repeats the request once.

You only need to know this when you add an endpoint that works without a session. Pass
`anonymous: true`, as `src/features/auth/api.ts` does:

```ts
// These endpoints run before there is an access token, on cookies alone.
const cookieOnly = { anonymous: true } as const;

export const authApi = {
  login: (input: LoginInput) => api.post<LoginResponse>('/auth/login', input, cookieOnly),
  // ...
};
```

Without it, a request made while a stale access token is still in memory would send that token,
and a 401 would start a refresh in the middle of a sign-in.

## Expired access tokens

An access token lasts 15 minutes. When an authenticated request comes back 401:

1. The client calls `POST /auth/refresh`, which uses the refresh cookie.
2. If that works, it stores the new access token and repeats the original request once.
3. If the API refuses (401 or 403), the session is over. The client drops the token and calls
   the handler registered with `api.onSessionExpired`. The auth store registered `clear`, so
   the user ends up on the sign-in page. The original request rejects with its 401.

Several requests can fail at the same moment, for example when a page with three queries is
opened after a break. They share one refresh call. A request that fails just after another one
has already renewed the token skips the refresh and retries with the new token.

A refresh that fails for any other reason, such as a network error or a 500, does **not** end
the session. An outage should not sign everyone out.

## Errors

Every failed request rejects with an `ApiError`:

```ts
class ApiError extends Error {
  status: number; // HTTP status, or 0 when there was no response
  code: string; // 'validation_error', 'email_taken', 'forbidden', ...
  message: string; // Written for the user
  details: { path: string; message: string }[]; // Per-field problems
  requestId: string | undefined; // The id in the API's logs
}
```

| What happened                                | `status` | `code`          | `message`                                                          |
| -------------------------------------------- | -------- | --------------- | ------------------------------------------------------------------ |
| The API answered with an error               | As sent  | As sent         | As sent                                                            |
| An error response that is not the API's JSON | As sent  | `http_<status>` | `The request failed (<status>).`                                   |
| No response at all                           | `0`      | `network_error` | `Could not reach the server. Check your connection and try again.` |

The middle row is what you get from a proxy's HTML error page, for instance a 502 while the API
restarts.

Three helpers cover almost every use.

**`errorMessage(error)`** gives a string that is safe to show for anything a request can throw.
An `ApiError` gives its message. Anything else gives a generic fallback, which you can replace
with the second argument:

```ts
onError: (error) => toast({ title: errorMessage(error), tone: 'danger' }),
```

**`isApiError(error, code?)`** narrows to `ApiError`, optionally to one error code:

```ts
if (isApiError(error, 'email_taken')) setError('email', { message: error.message });
```

Branch on `code`, never on `message`. Codes are part of the API's contract, and messages can be
reworded. The codes for sign-in are listed under
[Common error codes](/api/authentication#common-error-codes).

**`<QueryError>`** is the error state for a failed query. It shows the message, the request ID
when there is one, and a retry button:

```tsx
if (files.isError) {
  return <QueryError error={files.error} onRetry={() => void files.refetch()} />;
}
```

The request ID is the same id the API writes in its logs for that request. Someone reporting a
problem can quote it, and you can search the logs for it. For errors inside a form, see
[Forms](/frontend/forms#errors-from-the-api).

## Queries

The API calls and query definitions for a feature live in `src/features/<name>/api.ts`. A query
is defined once with `queryOptions` and used wherever it is needed:

```ts
import type { FileList } from '@bossbyte/shared';
import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function filesQueryOptions(page: number, pageSize: number) {
  return queryOptions({
    queryKey: ['files', 'list', { page, pageSize }],
    queryFn: ({ signal }) => api.get<FileList>('/files', { query: { page, pageSize }, signal }),
    placeholderData: keepPreviousData,
  });
}
```

```tsx
const files = useQuery(filesQueryOptions(page, PAGE_SIZE));
```

The same object works in a route loader (`queryClient.prefetchQuery(filesQueryOptions(1, 10))`)
and for cache updates (`filesQueryOptions(1, 10).queryKey`), with the data type carried along.

Three habits to keep:

- **Pass `signal`.** TanStack Query aborts it when the result is no longer wanted, for example
  when the user types another letter in a search box. The request is cancelled in the browser.
- **Start every key with the feature name**, then the kind, then the parameters:
  `['users', 'list', search]`, `['files', 'list', { page, pageSize }]`, `['reports', 'stats']`,
  `['reports', 'exports', jobId]`, `['auth', 'passkeys']`. Invalidating `['users']` then
  refreshes everything about users.
- **Put every parameter in the key.** A parameter that changes the response but is missing from
  the key shows one page's data under another's.

### Defaults

`src/lib/query-client.ts` sets these for every query:

| Setting                | Value                                    | Why                                                 |
| ---------------------- | ---------------------------------------- | --------------------------------------------------- |
| `staleTime`            | 30 seconds                               | Going back to a page you just left does not refetch |
| `refetchOnWindowFocus` | `false`                                  | Switching tabs does not reload tables               |
| `retry`                | Never for a 4xx, otherwise up to 2 times | A 4xx is the API's final answer                     |
| Mutation `retry`       | `false`                                  | Repeating a write on its own is not safe            |

A network error has status 0, so it is retried.

### Paginated lists

List endpoints answer `{ data, meta }`, where `meta` has `page`, `pageSize`, `total` and
`totalPages`. With `placeholderData: keepPreviousData`, the previous page stays on screen while
the next one loads, and `isPlaceholderData` is true in the meantime. The example pages dim the
table:

```tsx
const rows = files.data?.data ?? [];
const meta = files.data?.meta;

<>
  <DataTable
    caption="Files"
    columns={columns}
    rows={rows}
    rowKey={(file) => file.id}
    loading={files.isPending}
    className={cn(files.isPlaceholderData && 'opacity-60')}
  />
  {meta && meta.totalPages > 1 && (
    <Pagination page={meta.page} totalPages={meta.totalPages} onPageChange={setPage} />
  )}
</>;
```

`isPending` is true only on the very first load, when there is nothing to show yet. That is
when `DataTable` renders its skeleton rows.

The files page keeps the page number in component state. The users page keeps it in the URL.
See [Search params as state](/frontend/routing#search-params-as-state).

### Polling

A query can refetch on a timer until its data says to stop. The queued export on the reports
page checks its job every 1.5 seconds until it has finished:

```ts
export function exportJobQueryOptions(jobId: string) {
  return queryOptions({
    queryKey: ['reports', 'exports', jobId],
    queryFn: ({ signal }) => api.get<ExportJob>(`/reports/exports/${jobId}`, { signal }),
    refetchInterval: (query) => (isExportFinished(query.state.data) ? false : POLL_INTERVAL_MS),
    staleTime: Infinity,
  });
}
```

See [Exports and downloads](/frontend/exports#queued-exports).

## Mutations

A mutation hook wraps one API call and says which queries it makes stale:

```ts
export const usersApi = {
  create: (input: CreateUserInput) => api.post<User>('/users', input),
  update: (id: string, input: UpdateUserInput) => api.patch<User>(`/users/${id}`, input),
  remove: (id: string) => api.delete(`/users/${id}`),
};

/** Any change to a user also changes the dashboard figures. */
function useInvalidateUsers() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['users'] }),
      queryClient.invalidateQueries({ queryKey: ['reports', 'stats'] }),
    ]);
}

export function useUpdateUser() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateUserInput }) =>
      usersApi.update(id, input),
    onSuccess: invalidate,
  });
}
```

Invalidation belongs in the hook, so every caller gets it. What is specific to one screen, such
as a toast or closing a dialog, goes in the call:

```tsx
const updateUser = useUpdateUser();

function setActive(user: User, isActive: boolean) {
  updateUser.mutate(
    { id: user.id, input: { isActive } },
    {
      onSuccess: () =>
        toast({
          title: `${user.name} was ${isActive ? 'activated' : 'deactivated'}`,
          tone: 'success',
        }),
      onError: (error) => toast({ title: errorMessage(error), tone: 'danger' }),
    },
  );
}
```

`onSuccess` in the hook returns the invalidation promise, so the mutation stays pending until
the lists have been refetched. A button with `loading={updateUser.isPending}` keeps spinning
until the table shows the change.

Think about what else a change affects. Creating a user changes the count on the dashboard, so
the users hooks invalidate `['reports', 'stats']` as well.

### Writing to the cache directly

When a response already contains what a query would fetch, put it in the cache and save the
request. Queuing an export returns the job's first status:

```ts
const queue = useMutation({
  mutationFn: reportsApi.queueExport,
  // The response is the job's first status, so polling starts from it.
  onSuccess: (job) => queryClient.setQueryData(exportJobQueryOptions(job.id).queryKey, job),
});
```

## Uploads

Build a `FormData` and use `api.upload`. Do not set a `Content-Type` header. The browser adds it
with the multipart boundary:

```ts
export const filesApi = {
  upload(file: File) {
    const form = new FormData();
    form.append('file', file);
    return api.upload<StoredFile>('/files', form);
  },
};
```

The field name has to be the one the API route expects, which is `file` here. Check the file in
the browser first with `validateUpload` to save a round trip. See
[File inputs](/frontend/forms#file-inputs).

## Downloads

A plain link cannot send the Bearer header, so a file from a protected endpoint is fetched with
`api.download` and saved from memory:

```ts
const { blob, fileName } = await api.download('/reports/users.pdf');
saveBlob(blob, fileName ?? 'users.pdf');
```

`fileName` comes from the response's `Content-Disposition` header, and is `null` when the server
did not name the file. See [Exports and downloads](/frontend/exports).

## A second API

`createApiClient(baseUrl)` returns a new, independent client with its own token and CSRF state.
The app needs only the shared `api`. Create another for tests, or for a second backend:

```ts
import { createApiClient } from '@/lib/api';

const billing = createApiClient('https://billing.example.com/v1');
```

A cross-origin API needs CORS set up on its side, and the dashboard's Content-Security-Policy
has to allow the connection. See [HTTP headers](/api/security#http-headers).
