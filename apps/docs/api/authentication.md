# Authentication

The auth module is in `apps/api/src/modules/auth`. It supports four ways to sign in — password,
password plus TOTP, passkey, and Google through Firebase — and all of them end the same way: a
short-lived access token in the response body and a refresh token in an httpOnly cookie.

## The token model

|               | Access token                    | Refresh token                              |
| ------------- | ------------------------------- | ------------------------------------------ |
| Format        | JWT, RS256                      | Opaque random string (48 bytes, base64url) |
| Lifetime      | 15 minutes                      | 7 days                                     |
| Sent as       | `Authorization: Bearer <token>` | `bb_refresh` cookie                        |
| Stored client | In memory only                  | httpOnly cookie, path `/api/v1/auth`       |
| Stored server | Not stored                      | SHA-256 hash only, in `refresh_tokens`     |
| Revocable     | No — it expires                 | Yes, immediately                           |

Access tokens carry `sub` (the user id), `role`, `typ: "access"`, a `jti`, and the issuer and
audience from `JWT_ISSUER` and `JWT_AUDIENCE`. They are verified without a database lookup.
That means a role change or deactivation takes effect when the current access token expires, at
most 15 minutes later. The user's refresh tokens are revoked at once, so they cannot get a new
one.

The lifetimes and limits are constants in `SECURITY` (`packages/shared/src/constants/security.ts`).

### Refresh rotation and reuse detection

Each refresh token works once. `POST /auth/refresh` revokes the token it was given and issues a
new one in the same _family_. If a revoked token is ever presented again, someone has a copy they
should not have, so the API revokes the whole family, writes an `auth.refresh_reuse_detected`
audit entry and answers `401 invalid_refresh_token`. Every device in that family has to sign in
again.

The swap is one atomic `UPDATE … RETURNING`, so two concurrent refreshes cannot both succeed.

### Signing keys

`npm run setup` generates an RS256 key pair in `apps/api/keys/`. In production, provide the keys
either as files (`JWT_PRIVATE_KEY_PATH`, `JWT_PUBLIC_KEY_PATH`) or as base64-encoded PEM in
`JWT_PRIVATE_KEY` and `JWT_PUBLIC_KEY`. The API refuses to start without them.

## Endpoints

All paths are relative to `/api/v1/auth`.

### Public

| Method and path                | Body                        | Success                             |
| ------------------------------ | --------------------------- | ----------------------------------- |
| `GET /csrf-token`              | —                           | 200 `{ csrfToken }`                 |
| `POST /register`               | `{ name, email, password }` | 201 `{ accessToken, expiresIn }`    |
| `POST /login`                  | `{ email, password }`       | 200, see [below](#password-sign-in) |
| `POST /mfa/verify`             | `{ mfaToken, code }`        | 200 `{ accessToken, expiresIn }`    |
| `POST /firebase`               | `{ idToken }`               | 200, same as `/login`               |
| `POST /passkeys/login/options` | —                           | 200 `{ challengeId, options }`      |
| `POST /passkeys/login/verify`  | `{ challengeId, response }` | 200 `{ accessToken, expiresIn }`    |
| `POST /refresh`                | — (uses the cookie)         | 200 `{ accessToken, expiresIn }`    |
| `POST /logout`                 | — (uses the cookie)         | 204                                 |

### Authenticated

| Method and path                   | Body                               | Success                              |
| --------------------------------- | ---------------------------------- | ------------------------------------ |
| `GET /me`                         | —                                  | 200, the user                        |
| `PATCH /me`                       | `{ name, phone }`                  | 200, the user                        |
| `POST /change-password`           | `{ currentPassword, newPassword }` | 204                                  |
| `POST /totp/setup`                | —                                  | 200 `{ secret, uri, qrCodeDataUrl }` |
| `POST /totp/enable`               | `{ code }`                         | 204                                  |
| `POST /totp/disable`              | `{ password }`                     | 204                                  |
| `GET /passkeys`                   | —                                  | 200, a list of passkeys              |
| `POST /passkeys/register/options` | —                                  | 200, WebAuthn creation options       |
| `POST /passkeys/register/verify`  | `{ response, name }`               | 201, the passkey                     |
| `DELETE /passkeys/:id`            | —                                  | 204                                  |

`PATCH /me` replaces both fields: send `name` and `phone` together, with `phone: null` to clear
it. A user cannot change their own role here; `role` in the body is ignored.

The exact request and response schemas are in `packages/shared/src/schemas/auth.ts` and in
Swagger UI at http://localhost:4000/api/docs.

## Password sign-in

```bash
curl -i -c cookies.txt http://localhost:4000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer none' \
  -d '{"email":"admin@bossbyte.local","password":"BossByte-Dev-2026"}'
```

::: tip Why the odd Authorization header?
Requests that are not `GET` need a CSRF token unless they carry a Bearer header. From a script,
any Bearer header skips the check, because a browser cannot be tricked into sending one. From a
browser, fetch a token first. See [CSRF](/api/security#csrf).
:::

Without two-factor, the response is:

```json
{ "mfaRequired": false, "accessToken": "eyJ…", "expiresIn": 900 }
```

and a `bb_refresh` cookie is set. Use the token:

```bash
curl http://localhost:4000/api/v1/auth/me -H "Authorization: Bearer $ACCESS_TOKEN"
```

With two-factor enabled, the first step returns no session:

```json
{ "mfaRequired": true, "mfaToken": "eyJ…" }
```

Send the `mfaToken` (valid for 5 minutes) with the 6-digit code to `POST /auth/mfa/verify` to get
the access token and cookie.

### What protects it

- **Hashing** — bcrypt with 12 rounds.
- **Password policy** — 12 to 128 characters with a lowercase letter, an uppercase letter and a
  number (`passwordSchema`), enforced identically in the dashboard and the API.
- **No account enumeration** — a sign-in for an unknown email still runs a bcrypt comparison
  against a dummy hash and returns the same `401 invalid_credentials`.
- **Lockout** — 5 failed attempts for one email within 15 minutes lock it:
  `429 account_locked`. The counter is in Redis under `auth:failures:<email>`.
- **Rate limit** — 20 requests per 15 minutes per IP across the sign-in endpoints.
- **Audit** — `auth.login`, `auth.login_failed` and the rest are written to `audit_logs`.

### Registration

`POST /auth/register` creates a `viewer`, signs them in and queues a welcome email. A duplicate
email is a 409. If your product is invitation-only, remove the route and create users through
`POST /api/v1/users`.

### Changing a password

`POST /auth/change-password` checks the current password (`400 invalid_password` if wrong), then
revokes every session the user has, clears the cookie and emails them. They sign in again
everywhere, including on the device that made the change.

## Two-factor (TOTP)

Standard authenticator-app codes: SHA-1, 6 digits, 30-second period, one step of clock drift
allowed.

1. `POST /auth/totp/setup` returns the secret, an `otpauth://` URI and a QR code as a data URL.
   The secret is stored [encrypted](/api/encryption) but not yet active.
2. The user scans it and sends a code to `POST /auth/totp/enable`. Two-factor is now on.
3. `POST /auth/totp/disable` turns it off, and asks for the password again.

A code works once. After a successful check the API records
`auth:totp-used:<userId>:<counter>` in Redis for two minutes and rejects a replay of the same
code. That includes the code that enables two-factor: it cannot be used again to sign in.

| Code                   | Status  | When                                           |
| ---------------------- | ------- | ---------------------------------------------- |
| `totp_already_enabled` | 400     | Setup called while two-factor is on            |
| `totp_not_set_up`      | 400     | Enable called before setup                     |
| `invalid_totp_code`    | 400/401 | Wrong code (400 when enabling, 401 at sign-in) |

## Passkeys (WebAuthn)

Built on `@simplewebauthn/server`. The dashboard uses `@simplewebauthn/browser` for the other
half.

**Registering** (signed in):

1. `POST /auth/passkeys/register/options` → pass the result to the browser's WebAuthn API.
2. `POST /auth/passkeys/register/verify` with `{ response, name }` → 201 with the stored passkey.

**Signing in** (signed out):

1. `POST /auth/passkeys/login/options` → `{ challengeId, options }`. No email is needed: these
   are discoverable credentials, so the authenticator tells the API who the user is.
2. `POST /auth/passkeys/login/verify` with `{ challengeId, response }` → an access token.

A passkey sign-in skips TOTP, because a passkey is already a second factor.

Challenges live in Redis for 5 minutes and are consumed with `GETDEL`, so each can be used once.
Two settings must match where the dashboard is served:

- `WEBAUTHN_RP_ID` — the host name, such as `app.example.com` (`localhost` in development).
- `APP_URL` — its origin is the expected WebAuthn origin.

| Code                          | Status  | When                                                          |
| ----------------------------- | ------- | ------------------------------------------------------------- |
| `challenge_expired`           | 400     | The challenge is older than 5 minutes or already used         |
| `passkey_verification_failed` | 400/401 | The response did not verify (400 registering, 401 signing in) |
| `passkey_not_recognised`      | 401     | No stored passkey matches the credential                      |
| `passkey_not_found`           | 404     | Deleting a passkey that is not yours                          |

## Google sign-in through Firebase

Optional. It is off until you set `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` and
`FIREBASE_PRIVATE_KEY` in the API and the four `VITE_FIREBASE_*` values in the dashboard. While it
is off, the endpoint answers `501 firebase_not_configured` and the dashboard hides the button.

The dashboard signs the user in with the Firebase SDK and posts the resulting ID token:

```http
POST /api/v1/auth/firebase
Content-Type: application/json

{ "idToken": "eyJ…" }
```

The API verifies the token with `firebase-admin` (including a revocation check), requires a
verified email, and then:

1. finds the user by `firebaseUid`, or
2. links an existing account with the same verified email, or
3. creates a new `viewer`.

From there the flow is the same as a password sign-in. A user with TOTP enabled still has to
enter a code. Firebase only proves identity; sessions, roles and tokens are BossByte's own.

| Code                      | Status |
| ------------------------- | ------ |
| `invalid_firebase_token`  | 401    |
| `email_not_verified`      | 401    |
| `firebase_not_configured` | 501    |

## Common error codes

| Code                    | Status | Meaning                                       |
| ----------------------- | ------ | --------------------------------------------- |
| `unauthorized`          | 401    | No Bearer token                               |
| `token_expired`         | 401    | The access token expired. Refresh and retry   |
| `invalid_token`         | 401    | The token is malformed or failed verification |
| `invalid_credentials`   | 401    | Wrong email or password                       |
| `account_locked`        | 429    | Too many failed sign-ins for this email       |
| `account_disabled`      | 403    | The account is deactivated                    |
| `no_session`            | 401    | Refresh called without a refresh cookie       |
| `invalid_refresh_token` | 401    | Unknown, revoked or reused refresh token      |
| `refresh_token_expired` | 401    | The 7-day session ran out                     |

## Protecting your own routes

```ts
import { authenticate, authorize, currentUser } from '../../middleware/authenticate';

router.use(authenticate);

router.get('/mine', async (req, res) => {
  const { userId, role } = currentUser(req);
  res.json(await listMine(userId));
});

router.delete('/:id', authorize('files:delete'), handler);
```

`currentUser` throws a 401 if you call it on a route that forgot `authenticate`, so the mistake
shows up in the first test rather than in production. Permissions are covered in
[Authorization](/api/authorization).
