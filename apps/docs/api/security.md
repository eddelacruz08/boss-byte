# Security

What the API does to protect itself, where each piece lives, and what is left for you to do at
deployment. Authentication has [its own page](/api/authentication), as do
[authorization](/api/authorization) and [encryption at rest](/api/encryption).

Most numbers on this page come from one object, `SECURITY` in
`packages/shared/src/constants/security.ts`. The API enforces it and the dashboard reads it for
form hints, so you change a limit in one place.

| Setting                    | Value                            |
| -------------------------- | -------------------------------- |
| `password.minLength`       | 12 (maximum 128)                 |
| `password.bcryptRounds`    | 12                               |
| `tokens.accessTtlSeconds`  | 900 (15 minutes)                 |
| `tokens.refreshTtlSeconds` | 604,800 (7 days)                 |
| `lockout`                  | 5 failed attempts in 900 seconds |
| `rateLimit.global`         | 300 requests per minute          |
| `rateLimit.auth`           | 20 requests per 15 minutes       |
| `uploads.maxFileSizeBytes` | 10 MB                            |
| `cookies`                  | `bb_refresh`, `bb_csrf`          |
| `headers.csrfToken`        | `x-csrf-token`                   |

## HTTP headers

`helmet()` runs with its defaults on every response (`apps/api/src/app.ts`): a restrictive
Content-Security-Policy, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`, frame
protection, and the rest of the set. `X-Powered-By` is turned off.

The API serves JSON, so the defaults fit. The dashboard's own headers are set by nginx in the
Docker image (`docker/nginx/security-headers.conf`): `nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy`, `Permissions-Policy`, a Content-Security-Policy, and HSTS when the request
arrived over HTTPS. Override the policy with the `CONTENT_SECURITY_POLICY` environment variable
on the dashboard container when you add a third-party script or tile server.

## CORS

Only listed origins may call the API from a browser:

- the origin of `APP_URL`, and
- anything in `CORS_ORIGINS` (comma-separated).

```ini
APP_URL=https://app.example.com
CORS_ORIGINS=https://admin.example.com,https://staging.example.com
```

Credentials are allowed, because the refresh token travels in a cookie. Four response headers are
exposed to browser code: `x-request-id`, `Content-Disposition`, `RateLimit` and
`RateLimit-Policy`. Preflight responses are cached for 10 minutes.

In the default setup you never hit CORS at all: the dashboard calls `/api/v1` on its own origin,
and Vite (in development) or nginx (in the image) forwards it.

## CSRF

The refresh token is a cookie, and browsers attach cookies to cross-site requests on their own.
So any request that relies on a cookie must also carry something a foreign site cannot read. The
API uses the double-submit cookie pattern (`csrf-csrf`, in `src/middleware/csrf.ts`).

1. The browser asks for a token:

   ```bash
   curl -c jar.txt http://localhost:4000/api/v1/auth/csrf-token
   ```

   ```json
   { "csrfToken": "…" }
   ```

   The response also sets two `httpOnly` cookies: `bb_sid`, an anonymous device identifier that
   lasts a year, and `bb_csrf`, the signed counterpart of the token.

2. Every `POST`, `PATCH`, `PUT` and `DELETE` sends the token back in the `x-csrf-token` header:

   ```bash
   curl -b jar.txt -c jar.txt http://localhost:4000/api/v1/auth/login \
     -H 'Content-Type: application/json' \
     -H "x-csrf-token: $CSRF_TOKEN" \
     -d '{"email":"admin@bossbyte.local","password":"BossByte-Dev-2026"}'
   ```

3. A missing or wrong token is rejected:

   ```json
   { "error": { "code": "invalid_csrf_token", "message": "Invalid or missing CSRF token" } }
   ```

   with status 403.

The rules:

- `GET`, `HEAD` and `OPTIONS` are never checked.
- **A request with an `Authorization: Bearer …` header is exempt.** A browser never adds that
  header by itself, so such a request cannot be forged from another site. This keeps the API easy
  to call from scripts, mobile apps and tests.
- That leaves the cookie-only requests, which are exactly the ones that need protecting: sign-in,
  registration, token refresh and sign-out.
- A token is bound to the `bb_sid` cookie of the browser that asked for it. It is useless
  anywhere else.

The dashboard's API client (`apps/core/src/lib/api.ts`) does all of this for you. See
[API client](/frontend/api-client#csrf).

Cookies are `SameSite=Lax` by default (`COOKIE_SAME_SITE`) and `Secure` in production. The
refresh cookie is also `httpOnly` and scoped to the path `/api/v1/auth`, so it is not sent with
any other request. If the dashboard and the API are on different sites, set
`COOKIE_SAME_SITE=none`, which requires HTTPS.

## Rate limiting

Two limiters, both in `src/middleware/rate-limit.ts`, both counted per client IP address:

| Limiter  | Default           | Applies to                            |
| -------- | ----------------- | ------------------------------------- |
| `global` | 300 per minute    | Everything except `/health`           |
| `auth`   | 20 per 15 minutes | The endpoints that accept credentials |

The `auth` limiter covers `register`, `login`, `mfa/verify`, `firebase`,
`passkeys/login/options`, `passkeys/login/verify`, `change-password`, `totp/enable` and
`totp/disable`. `refresh` and `logout` are not on it, so a busy tab cannot lock its own user out.

Over the limit, the API answers `429`:

```json
{ "error": { "code": "too_many_requests", "message": "Too many requests. Please slow down." } }
```

Responses carry the standard `RateLimit` and `RateLimit-Policy` headers (IETF draft 8), which
tell a client how much allowance is left and when it resets.

Things to know:

- **Counters live in Redis** under `ratelimit:<name>:`, so the limit holds across every API
  instance, not per process.
- **If Redis is down, requests are let through.** A rate limiter that takes the API down with it
  is worse than none for a short while.
- **Set `TRUST_PROXY` correctly.** Behind a load balancer every request appears to come from the
  proxy, and all your users share one allowance. Set `TRUST_PROXY` to the number of proxies in
  front of the API. Too high is also wrong: it lets a client forge its address with
  `X-Forwarded-For`.
- **Override per environment** with `RATE_LIMIT_GLOBAL_MAX` and `RATE_LIMIT_AUTH_MAX`. The window
  lengths are fixed in `SECURITY.rateLimit`. The Playwright configuration raises the auth limit
  to 1,000 for the API it starts, so end-to-end tests can sign in freely.

To put the tight limit on a route of your own:

```ts
import { authRateLimit } from '../../middleware/rate-limit';

router.post('/redeem', authRateLimit, async (req, res) => {
  // …
});
```

Rate limiting by IP is separate from the per-account lockout, which counts failed passwords for
one email address whatever address they come from. See
[Authentication](/api/authentication).

## Input and upload limits

| Limit                  | Value                  | Where                                    |
| ---------------------- | ---------------------- | ---------------------------------------- |
| JSON body              | 1 MB                   | `express.json` in `src/app.ts`           |
| Uploaded file          | 10 MB, one per request | `SECURITY.uploads`, `src/lib/uploads.ts` |
| Other multipart fields | 10                     | `src/lib/uploads.ts`                     |
| Proxy body size        | 12 MB                  | `docker/nginx/default.conf.template`     |
| Page size              | 100 rows               | `paginationQuerySchema`                  |

Every body, query string and path parameter is parsed with a Zod schema before a handler uses it.
Zod objects drop unknown keys, so a client cannot slip an extra field such as `role` into an
endpoint that does not accept one.

Uploads are checked by content, not by name or declared type, and images are re-encoded. See
[File storage](/api/storage#the-upload-pipeline).

SQL goes through Drizzle, which sends values as parameters. If you write raw SQL, use the `sql`
template tag and never build a query by joining strings.

## Audit log

Security-relevant actions are appended to the `audit_logs` table: who (`user_id`), what
(`action`), details (`metadata`, JSON), from where (`ip_address`) and when (`created_at`).

| Action                        | Metadata                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------- |
| `auth.register`               | `method: "register"`, `userAgent`, `ipAddress`                                   |
| `auth.login`                  | `method` (`password`, `totp`, `passkey` or `firebase`), `userAgent`, `ipAddress` |
| `auth.login_failed`           | `email` (the address that was tried), `userAgent`, `ipAddress`                   |
| `auth.logout`                 |                                                                                  |
| `auth.refresh_reuse_detected` | `familyId`, `userAgent`, `ipAddress`                                             |
| `auth.password_changed`       |                                                                                  |
| `auth.totp_enabled`           |                                                                                  |
| `auth.totp_disabled`          |                                                                                  |
| `auth.passkey_added`          | `passkeyId`                                                                      |
| `auth.passkey_removed`        | `passkeyId`                                                                      |
| `user.created`                | `targetId`, `role`                                                               |
| `user.updated`                | `targetId`, `fields` (names only, never values)                                  |
| `user.deleted`                | `targetId`                                                                       |
| `file.uploaded`               | `fileId`, `mimeType`, `sizeBytes`                                                |
| `file.deleted`                | `fileId`                                                                         |
| `report.exported`             | `report`, `format`, and `rows` or `jobId`                                        |

Record your own events with `audit` from `src/lib/audit.ts`:

```ts
import { audit } from '../../lib/audit';

await audit({ action: 'user.deleted', metadata: { targetId: id }, req });
```

Passing `req` fills in the signed-in user and the IP address. For an event with no signed-in
user (a failed sign-in), pass `userId` yourself, or leave it out.

To add a new action, extend the `AuditAction` union in the same file. The compiler then accepts
it everywhere.

Three rules the existing code follows:

- **Never put secrets in `metadata`, and as little personal data as you can.** `user.updated`
  records which fields changed, not their values.
- **Auditing never breaks the request.** If the insert fails, `audit` logs the error and returns.
- **The table is append-only by convention.** Nothing in the application updates or deletes rows.
  Deleting a user sets `user_id` to `NULL` on their entries instead of removing them. To make it
  append-only in fact, revoke `UPDATE` and `DELETE` on the table from the application's database
  role.

The ten most recent entries appear on the dashboard's overview page, through
`GET /api/v1/reports/stats`. There is no endpoint to browse the full log; query the table, or add
an endpoint behind a new permission.

## Logging

The API logs JSON with Pino (`src/lib/logger.ts`), one line per request, at `LOG_LEVEL`. In
development the output is pretty-printed; in production it is plain JSON for your log collector.

Use the request's own logger inside a handler, so the line carries the request id:

```ts
req.log.info({ fileId: file.id }, 'File uploaded');
```

Elsewhere, import `logger`:

```ts
import { logger } from '../lib/logger';

logger.warn({ jobId: job.id }, 'Retrying export');
```

### Redaction

These paths are replaced with `[redacted]` before a line is written, whatever a caller passes in:

- Request headers `authorization`, `cookie` and `x-csrf-token`; response header `set-cookie`
- One level down in any logged object: `password`, `currentPassword`, `newPassword`,
  `accessToken`, `refreshToken`, `mfaToken`, `idToken`, `secret`

Redaction matches **key names at a fixed depth**. `logger.info({ body: req.body })` is covered;
a password nested two levels down, or stored under another name, is not. It does not know what a
phone number or an email address is. Do not log request bodies or user records wholesale; log ids.

### Request ids

Every response has an `x-request-id` header, and every log line for that request has the same
value in `req.id`. If the incoming request already has an `x-request-id` (from a load balancer)
that looks safe (up to 64 letters, digits, dots, dashes and underscores), it is reused; otherwise
a UUID is generated. Error responses include it as `error.requestId`, so a user can quote it and
you can find the request.

Requests to `/health` are not logged.

## Before you go to production

- [ ] Serve everything over HTTPS, and set `NODE_ENV=production` so cookies are `Secure`.
- [ ] Set `APP_URL` to the dashboard's public URL and `WEBAUTHN_RP_ID` to its host name.
- [ ] Set `TRUST_PROXY` to the real number of proxies in front of the API.
- [ ] Generate fresh JWT keys, `CSRF_SECRET`, `DATA_ENCRYPTION_KEY` and `BLIND_INDEX_KEY` for each
      environment. Keep them in a secret manager and back the encryption keys up apart from the
      database.
- [ ] Think twice before running `npm run db:seed` against production. It refuses to run there
      with the default password; if you do need the accounts, set `SEED_PASSWORD` and change the
      passwords at once.
- [ ] Use TLS to PostgreSQL (`DATABASE_SSL=true`) and Redis.
- [ ] Keep the storage bucket private, with server-side encryption on.
- [ ] Decide whether `/api/docs` and `/api/openapi.json` should be reachable from the internet.
      They are public by default; block them at the proxy if not.
- [ ] Decide whether open registration is right for you. `POST /api/v1/auth/register` lets anyone
      create a `viewer` account; remove the route if accounts should be created by an admin only.
- [ ] Run `npm audit --omit=dev --audit-level=high` and `npm run licenses`. CI does both.
