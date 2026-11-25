# API overview

`@bossbyte/api` is an Express 5 application in `apps/api`. It has two entry points that share all
their code:

- `src/server.ts` — the HTTP API, on port 4000.
- `src/worker.ts` — the [background worker](/api/jobs), which processes Bull queues.

Every route lives under `/api/v1`, except the health checks and the API reference.

| Path                    | What it is                                               |
| ----------------------- | -------------------------------------------------------- |
| `GET /health`           | Liveness. `{ "status": "ok", "uptime": 42 }`             |
| `GET /health/ready`     | Readiness. Checks PostgreSQL, Redis and storage          |
| `GET /api/docs`         | Swagger UI                                               |
| `GET /api/openapi.json` | The OpenAPI 3.1 document                                 |
| `/api/v1/auth`          | [Authentication](/api/authentication)                    |
| `/api/v1/users`         | User management                                          |
| `/api/v1/files`         | [File storage](/api/storage)                             |
| `/api/v1/reports`       | Statistics, [exports](/api/documents) and import preview |
| `/api/v1/valuation`     | [Valuation models](/api/valuation)                       |

## Module layout

Each feature is a folder under `src/modules` with two files:

```text
src/modules/files/
├── files.routes.ts     HTTP: parse input, check permission, call the service, respond
└── files.service.ts    The work: queries and rules. No req, no res
```

A complete route file, from `src/modules/files/files.routes.ts`:

```ts
export const filesRouter: Router = Router();

filesRouter.use(authenticate);

filesRouter.get('/', authorize('files:read'), async (req, res) => {
  res.json(await listFiles(parseQuery(paginationQuerySchema, req)));
});

filesRouter.delete('/:id', authorize('files:delete'), async (req, res) => {
  const { id } = parseParams(idParamSchema, req);
  await deleteFile(id);
  await audit({ action: 'file.deleted', metadata: { fileId: id }, req });
  res.status(204).end();
});
```

The building blocks:

| Helper                                     | From                         | What it does                                              |
| ------------------------------------------ | ---------------------------- | --------------------------------------------------------- |
| `authenticate`                             | `middleware/authenticate.ts` | Verifies the Bearer token and sets `req.auth`             |
| `authorize(...permissions)`                | `middleware/authenticate.ts` | 403 unless the role holds every listed permission         |
| `currentUser(req)`                         | `middleware/authenticate.ts` | `{ userId, role }` of the caller                          |
| `parseBody` / `parseQuery` / `parseParams` | `lib/validate.ts`            | Parse with a Zod schema; a failure becomes a 400          |
| `audit({ action, metadata, req })`         | `lib/audit.ts`               | Appends to `audit_logs`. Never throws                     |
| `cached(key, ttlSeconds, load)`            | `lib/redis.ts`               | Read-through Redis cache. `invalidate(...keys)` clears it |

To add a module of your own, follow the
[walkthrough in Conventions](/guide/conventions#add-a-module-end-to-end).

## Request lifecycle

`createApp()` in `src/app.ts` assembles the middleware in this order. The order matters.

1. **Proxy trust** — `trust proxy` is set from `TRUST_PROXY`, so `req.ip` is the real client.
2. **Request logging** — `pino-http` assigns a request id (the incoming `x-request-id` if it looks
   sane, otherwise a UUID) and echoes it in the `x-request-id` response header.
3. **Helmet** — security headers.
4. **CORS** — allows the origin of `APP_URL` plus `CORS_ORIGINS`, with credentials.
5. **Health routes** — mounted here, above the rate limiter, so probes are never throttled.
6. **Global rate limit** — 300 requests per minute per IP.
7. **Cookie and JSON parsing** — JSON bodies up to 1 MB.
8. **API reference** — `/api/openapi.json` and `/api/docs`.
9. **Device session and CSRF** — see [Security](/api/security#csrf).
10. **The `/api/v1` router** — your modules.
11. **404 handler**, then the **error handler**.

Inside a module, a typical request goes `authenticate` → `authorize` → `parse*` → service →
`res.json`.

## Errors

Every error has the same JSON envelope:

```json
{
  "error": {
    "code": "user_not_found",
    "message": "User not found",
    "requestId": "0b9c4a6e-6a3b-4a39-9d0a-0d6c3f0f3f61"
  }
}
```

Validation errors add `details`, an array of `{ "path": "email", "message": "…" }`.

Throw one of the helpers from `src/lib/errors.ts`; the error handler does the rest.

| Helper                                          | Status | Default code        |
| ----------------------------------------------- | ------ | ------------------- |
| `badRequest(message, code, details?)`           | 400    | `bad_request`       |
| `unauthorized(message, code)`                   | 401    | `unauthorized`      |
| `forbidden(message, code)`                      | 403    | `forbidden`         |
| `notFound(message, code)`                       | 404    | `not_found`         |
| `conflict(message, code)`                       | 409    | `conflict`          |
| `tooManyRequests(message, code)`                | 429    | `too_many_requests` |
| `notImplemented(message, code)`                 | 501    | `not_implemented`   |
| `new AppError(status, code, message, details?)` | any    | —                   |

Errors the handler translates for you:

| Cause                       | Status | Code                 |
| --------------------------- | ------ | -------------------- |
| A `ZodError` from `parse*`  | 400    | `validation_error`   |
| Malformed JSON body         | 400    | `invalid_json`       |
| JSON body over 1 MB         | 413    | `payload_too_large`  |
| Upload over 10 MB           | 413    | `file_too_large`     |
| Any other multipart problem | 400    | `invalid_upload`     |
| Missing or wrong CSRF token | 403    | `invalid_csrf_token` |
| Rate limit exceeded         | 429    | `too_many_requests`  |
| No such route               | 404    | `route_not_found`    |
| Anything else               | 500    | `internal_error`     |

A 500 always says "Something went wrong". The stack trace is logged with the request id and
never sent to the client.

## Validation

Request schemas live in `@bossbyte/shared`, so the dashboard validates forms with the same rules
the API enforces.

```ts
import { createUserSchema, idParamSchema, listUsersQuerySchema } from '@bossbyte/shared';
import { parseBody, parseParams, parseQuery } from '../../lib/validate';

const input = parseBody(createUserSchema, req); // typed as the schema's output
const { id } = parseParams(idParamSchema, req); // a malformed uuid is a 400, not a 500
const query = parseQuery(listUsersQuerySchema, req); // strings coerced, defaults applied
```

## Pagination

List endpoints take `page` (default 1) and `pageSize` (default 20, at most 100) and return:

```json
{
  "data": [],
  "meta": { "page": 1, "pageSize": 20, "total": 0, "totalPages": 0 }
}
```

Use `paginationQuerySchema` and `paginatedSchema(item)` from `@bossbyte/shared` for the contract,
and `paginationOffset` and `buildPaginationMeta` in the service.

## OpenAPI and Swagger UI

The API reference is generated, not written. `src/docs/openapi.ts` converts the shared Zod schemas
to JSON Schema with `z.toJSONSchema` and builds an OpenAPI 3.1 document from a list of route
descriptions.

- Swagger UI: http://localhost:4000/api/docs
- Raw document: http://localhost:4000/api/openapi.json

To document a new endpoint, register its schemas in `requestSchemas` or `responseSchemas` and add
an entry to the `routes` array:

```ts
{
  method: 'post',
  path: '/files',
  tag: 'Files',
  summary: 'Upload a file',
  permission: 'files:write',
  body: 'file',
  status: 201,
  response: 'File',
  errors: [413],
},
```

| Field        | Meaning                                                                                  |
| ------------ | ---------------------------------------------------------------------------------------- |
| `path`       | Relative to `/api/v1`, in OpenAPI form: `/users/{id}`                                    |
| `public`     | `true` for routes that need no token                                                     |
| `permission` | The permission the route requires; shown in the description                              |
| `query`      | A Zod schema for the query string                                                        |
| `body`       | A name from `requestSchemas`, or `'file'` for a multipart upload                         |
| `status`     | Success status: 200 (default), 201, 202 or 204                                           |
| `response`   | A name from `responseSchemas`, `{ arrayOf: name }`, `{ binary: mimeType }` or `'object'` |
| `errors`     | Extra error statuses worth listing                                                       |

The document is not checked against the routers. Adding a route without adding it here leaves it
working but undocumented.

## Health checks

- `GET /health` answers as long as the process is up. Use it as a liveness probe.
- `GET /health/ready` checks the three things the API depends on, each with a 2-second timeout:
  `select 1` on PostgreSQL, a Redis `PING` and the storage driver's `ping()`. Use it as a
  readiness probe.

The answer lists every check, and the status depends on which one failed:

| Result                          | HTTP | `status`      |
| ------------------------------- | ---- | ------------- |
| Everything reachable            | 200  | `ok`          |
| Only storage unreachable        | 200  | `degraded`    |
| PostgreSQL or Redis unreachable | 503  | `unavailable` |

```json
{ "status": "degraded", "checks": { "database": "ok", "redis": "ok", "storage": "error" } }
```

Storage is reported but does not fail the probe. Only the file endpoints need it, and taking
every instance out of rotation would turn a storage outage into a full one. Alert on `degraded`
if you want to hear about it.

## Shutdown

Both processes handle `SIGTERM` and `SIGINT` through `onShutdown` in `src/lib/shutdown.ts`. The
API stops accepting connections, lets requests in flight finish, then closes its queues, Redis and
the database pool. If cleanup takes longer than 25 seconds the process exits anyway.
