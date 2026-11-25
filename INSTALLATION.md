# Installation guide

This guide takes you from a fresh clone to a running BossByte stack: the API, the
background worker, the dashboard and the services they depend on.

## Requirements

| Tool           | Version                | Notes                                                                  |
| -------------- | ---------------------- | ---------------------------------------------------------------------- |
| Node.js        | 26 or newer            | The version is pinned in `.nvmrc`; `nvm install` picks it up.          |
| npm            | 11 or newer            | Ships with Node.js 26. The repository uses npm workspaces.             |
| Docker         | Engine 24+, Compose v2 | Runs PostgreSQL, Redis, MinIO, Mailpit and pgAdmin for development.    |
| Git            | any recent version     |                                                                        |
| A free port on | 4000, 5173, 5174       | API, dashboard and documentation site. Service ports are listed below. |

You do not need PostgreSQL, Redis or MinIO installed on your machine. Docker
Compose provides them.

## Quick start

```bash
nvm install                # Node.js 26, from .nvmrc
npm install                # every workspace in one go
npm run setup              # .env files, JWT key pair, encryption keys
npm run docker:up          # PostgreSQL, Redis, MinIO, Mailpit, pgAdmin
npm run db:migrate         # create the tables
npm run db:seed            # demo accounts
npm run dev                # API, worker, dashboard and docs, with reload
```

Then open <http://localhost:5173> and sign in as `admin@bossbyte.local` with the
password `BossByte-Dev-2026`.

The rest of this guide explains each step and what to do when one fails.

## Step by step

### 1. Get the code and the right Node.js

```bash
git clone <your-repository-url> bossbyte
cd bossbyte
nvm install        # or: fnm use, volta, asdf — anything that reads .nvmrc
node --version     # v26.x
```

`package.json` declares `"engines": { "node": ">=26.0.0" }`, so npm warns if you
are on an older release.

### 2. Install dependencies

```bash
npm install
```

One install at the root covers every app and package. npm 11 does not run
dependency install scripts unless they are approved, and the approved list lives
in the root `package.json` under `allowScripts` (`bcrypt` and `esbuild` need
theirs; the rest are switched off on purpose).

### 3. Generate local configuration

```bash
npm run setup
```

The script only creates what is missing, so it is safe to run again at any time.
It:

1. checks your Node.js version;
2. creates `apps/api/.env` and `apps/core/.env` from their `.env.example` files;
3. generates the RS256 key pair that signs access tokens, in `apps/api/keys/`;
4. fills in `CSRF_SECRET`, `DATA_ENCRYPTION_KEY` and `BLIND_INDEX_KEY` in
   `apps/api/.env`;
5. points `apps/api/.env` at any service ports you moved in the root `.env`
   (see [Changing ports](#changing-ports)).

All of these files are ignored by Git. Never commit them.

> **Keep `DATA_ENCRYPTION_KEY` safe.** Columns such as phone numbers and TOTP
> secrets are encrypted with it (AES-256-GCM). If the key is lost, that data
> cannot be recovered. Use a separate key for every environment.

### 4. Start the backing services

```bash
npm run docker:up
```

| Service    | Address                 | Credentials                       |
| ---------- | ----------------------- | --------------------------------- |
| PostgreSQL | `localhost:5432`        | `bossbyte` / `bossbyte`           |
| Redis      | `localhost:6379`        | none                              |
| MinIO (S3) | `http://localhost:9000` | `minioadmin` / `minioadmin`       |
| MinIO UI   | <http://localhost:9001> | `minioadmin` / `minioadmin`       |
| Mailpit    | SMTP `localhost:1025`   | none                              |
| Mailpit UI | <http://localhost:8025> | none                              |
| pgAdmin    | <http://localhost:5050> | `admin@bossbyte.dev` / `bossbyte` |

Two databases are created: `bossbyte` for development and `bossbyte_test` for
the integration tests. The `bossbyte` storage bucket is created for you, and
pgAdmin comes with the server already registered.

Check that everything is healthy with `docker compose ps`. Stop the services
with `npm run docker:down`; your data stays in Docker volumes.

### 5. Create the schema and the demo accounts

```bash
npm run db:migrate
npm run db:seed
```

Migrations are plain SQL files in `apps/api/migrations/`, applied in order and
recorded in the `schema_migrations` table. The seed creates one account per role:

| Email                    | Role    |
| ------------------------ | ------- |
| `admin@bossbyte.local`   | admin   |
| `manager@bossbyte.local` | manager |
| `staff@bossbyte.local`   | staff   |
| `viewer@bossbyte.local`  | viewer  |

All four use the password `BossByte-Dev-2026`. Set `SEED_PASSWORD` to choose
another. The seed refuses to run when `NODE_ENV=production`.

### 6. Run it

```bash
npm run dev
```

Turborepo starts everything with live reload:

| What          | URL                                             |
| ------------- | ----------------------------------------------- |
| Dashboard     | <http://localhost:5173>                         |
| API           | <http://localhost:4000/api/v1>                  |
| Swagger UI    | <http://localhost:4000/api/docs>                |
| OpenAPI JSON  | <http://localhost:4000/api/openapi.json>        |
| Health checks | <http://localhost:4000/health>, `/health/ready` |
| Documentation | <http://localhost:5174>                         |

The background worker has no URL; watch its log lines in the same terminal.
The dashboard's dev server proxies `/api` to the API, so the browser only ever
talks to one origin.

To start a single app, use its workspace:

```bash
npm run dev -w @bossbyte/api          # API only
npm run dev:worker -w @bossbyte/api   # worker only
npm run dev -w @bossbyte/core         # dashboard only
npm run docs:dev                      # documentation only
```

### 7. Check your installation

```bash
npm run lint
npm run typecheck
npm run test                  # unit and component tests, no services needed
npm run test:integration      # API against PostgreSQL and Redis (step 4)
npx playwright install chromium
npm run test:e2e              # browser tests against the running stack
```

The integration tests use the `bossbyte_test` database and Redis database 1, and
refuse to run against anything else, so they never touch your development data.

## Changing ports

If a port is already taken, Docker reports `port is already allocated`. Copy the
root `.env.example` to `.env`, uncomment the port you need to move, then run the
setup script again so the API follows:

```bash
cp .env.example .env
# edit .env, for example: MINIO_PORT=9100 and MINIO_CONSOLE_PORT=9101
npm run docker:up
npm run setup
```

The API port is `PORT` in `apps/api/.env`. If you change it, change
`VITE_API_PROXY_TARGET` in `apps/core/.env` to match.

## Optional features

Everything below is switched off until you configure it. The app runs without it.

- **Google sign-in (Firebase).** Set the `FIREBASE_*` values in `apps/api/.env`
  and the four `VITE_FIREBASE_*` values in `apps/core/.env`. Until then the
  button is hidden and `POST /api/v1/auth/firebase` answers `501`.
- **Google Cloud Storage.** Set `STORAGE_DRIVER=gcs`, `GCS_BUCKET` and
  `GCS_PROJECT_ID` in `apps/api/.env`. The default driver is S3, pointed at the
  local MinIO.
- **Passkeys on a real domain.** WebAuthn is bound to a domain. Locally it works
  on `localhost`; elsewhere set `WEBAUTHN_RP_ID` and `APP_URL` to your domain.

## Production builds

```bash
npm run build                 # apps/api/dist and apps/core/dist
```

Three ways to run the result are prepared. The documentation site covers each in
its Deployment section.

- **Docker images.** `docker compose --profile app up --build` builds the API
  image (`node:26-slim`) and the dashboard image (static files on Nginx 1.31),
  runs the migrations and starts the API, the worker and the dashboard, which
  is then at <http://localhost:8080> (`CORE_PORT` in the root `.env` moves it).
- **PM2.** `pm2 start ecosystem.config.cjs --env production` runs the API, the
  worker and the dashboard as three processes. PM2 is AGPL-licensed, so it is
  not a dependency of this repository; install it on the host with
  `npm install --global pm2`.
- **Google Cloud Run.** The `deploy-dev` GitHub Actions workflow builds both
  images and deploys them.

## Troubleshooting

**`npm install` warns about `EBADENGINE`.**
You are not on Node.js 26. Run `nvm install` in the repository root.

**`bcrypt` fails to load, or "Cannot find module … bcrypt_lib.node".**
Its install script did not run. Check that `allowScripts` in the root
`package.json` still lists `"bcrypt": true`, then run `npm rebuild bcrypt`.

**`port is already allocated` from Docker.**
Another program is using the port. See [Changing ports](#changing-ports).

**The MinIO images cannot be pulled.**
MinIO stopped publishing images to Docker Hub, so the stack uses Chainguard's
builds from `cgr.dev`. If your network blocks that registry, set `MINIO_IMAGE`
and `MINIO_MC_IMAGE` in the root `.env` to a build you can reach.

**The API exits with "Invalid environment configuration".**
The message lists the settings that are missing or malformed. Run
`npm run setup`, or compare `apps/api/.env` with `apps/api/.env.example`.

**The API cannot connect to PostgreSQL or Redis.**
Check `docker compose ps`. Every service should be `healthy`. If you moved a
port in the root `.env`, run `npm run setup` again.

**Uploads fail with a storage error.**
`S3_ENDPOINT` in `apps/api/.env` must point at the MinIO port, and the
`bossbyte` bucket must exist. `docker compose up -d minio-init` recreates it.

**Requests fail with "Invalid or missing CSRF token".**
The dashboard and the API must share an origin. Open the dashboard on
`http://localhost:5173`, not `127.0.0.1`, and leave `VITE_API_URL` at `/api/v1`.

**Sign-in answers "Too many requests".**
The endpoints that accept credentials allow 20 attempts per 15 minutes from one
address. Wait, or set `RATE_LIMIT_AUTH_MAX` in `apps/api/.env` to a higher
number and restart the API. The Playwright tests raise it for the API they start.

**Everyone was signed out after running setup with `--force`.**
That flag replaces the JWT key pair and the CSRF secret, which is what it is for.

**Start again from nothing.**

```bash
npm run docker:down -- --volumes     # deletes the local databases and bucket
npm run docker:up
npm run db:migrate && npm run db:seed
```
