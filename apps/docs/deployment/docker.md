# Docker

Docker does two jobs in this repository:

1. **Backing services for development.** PostgreSQL, Redis, MinIO, Mailpit and pgAdmin, started
   by `npm run docker:up`. You run the API and dashboard yourself with `npm run dev`.
2. **Production images.** One for the API (which is also the worker and the migration runner) and
   one for the dashboard. You can run them locally with `--profile app`, and the
   [Cloud Run workflow](/deployment/cloud-run) deploys the same images.

Everything is defined in `docker-compose.yml` and the `docker/` folder.

## Backing services

```bash
npm run docker:up     # docker compose up -d
npm run docker:down   # docker compose down (keeps the data)
```

| Service      | Image                | Host port                     | What it is for                            |
| ------------ | -------------------- | ----------------------------- | ----------------------------------------- |
| `postgres`   | `postgres:16-alpine` | 5432                          | The database                              |
| `redis`      | `redis:7-alpine`     | 6379                          | Cache, rate limits, lockouts, Bull queues |
| `minio`      | Chainguard MinIO     | 9000 (S3 API), 9001 (console) | S3-compatible object storage              |
| `minio-init` | Chainguard `mc`      | —                             | Creates the `bossbyte` bucket, then exits |
| `mailpit`    | `axllent/mailpit`    | 1025 (SMTP), 8025 (inbox)     | Catches every email the API sends         |
| `pgadmin`    | `dpage/pgadmin4`     | 5050                          | Database browser                          |

Where to look:

| Tool          | URL                   | Sign in with                      |
| ------------- | --------------------- | --------------------------------- |
| Mailpit inbox | http://localhost:8025 | —                                 |
| MinIO console | http://localhost:9001 | `minioadmin` / `minioadmin`       |
| pgAdmin       | http://localhost:5050 | `admin@bossbyte.dev` / `bossbyte` |

pgAdmin comes with the **BossByte (local)** server already registered, password included.

Things worth knowing:

- **Two databases.** `bossbyte` is for development. `bossbyte_test` is created by
  `docker/postgres/init/01-create-test-database.sql` when the data volume is first initialised,
  and belongs to the [integration tests](/testing#the-disposable-database-guard).
- **Redis is configured for queues**: append-only persistence and `noeviction`, because Bull keeps
  jobs in Redis and an evicted key is a lost job. Use the same policy in production.
- **Data lives in named volumes** (`postgres-data`, `redis-data`, `minio-data`, `pgadmin-data`)
  and survives `docker:down`.

::: warning
The credentials in `docker-compose.yml` are well-known defaults for local use. Never reuse them
in a hosted environment.
:::

### Start again from nothing

```bash
docker compose down --volumes   # deletes the database, the queues and the uploaded files
npm run docker:up
npm run db:migrate
npm run db:seed
```

### Move a port

If a port is taken, copy the root `.env.example` to `.env` and set the variable, for example
`POSTGRES_PORT=5433`. Then run `npm run setup` again so `apps/api/.env` follows. The variables are
listed under [Environment variables](/guide/environment#docker-compose-root-env).

## Run the production images locally

The `app` profile adds the built application to the stack. Use it to check an image before it is
deployed, or to demo without a development toolchain.

```bash
npm run setup                          # once, for the keys and secrets
docker compose --profile app up -d --build
```

Then open http://localhost:8080.

| Service   | Command                | Port | Notes                                                                |
| --------- | ---------------------- | ---- | -------------------------------------------------------------------- |
| `migrate` | `node dist/migrate.js` | —    | Applies pending migrations and exits. The API and worker wait for it |
| `api`     | `node dist/server.js`  | 4000 |                                                                      |
| `worker`  | `node dist/worker.js`  | —    | Serves its health check on 4001 inside the container                 |
| `core`    | Nginx                  | 8080 | The dashboard. Proxies `/api/` to `api`                              |

The database starts empty. To add the demo accounts, run the seed in a one-off container. Seeding
with `NODE_ENV=production` requires you to choose the password:

```bash
docker compose --profile app run --rm -e SEED_PASSWORD='Choose-A-Password-1' api node dist/seed.js
```

How the containers are configured:

- They read the secrets `npm run setup` wrote to `apps/api/.env` (`CSRF_SECRET`,
  `DATA_ENCRYPTION_KEY`, `BLIND_INDEX_KEY`).
- The compose file overrides what differs inside the network: `DATABASE_URL` points at
  `postgres`, `REDIS_URL` at `redis`, `S3_ENDPOINT` at `minio`, `SMTP_HOST` at `mailpit`, and
  `APP_URL` at `http://localhost:8080`.
- `S3_PUBLIC_ENDPOINT` is `http://localhost:9000`, because signed download URLs are opened by your
  browser, which cannot resolve the name `minio`.
- `TRUST_PROXY` is `1`: Nginx in the `core` container is the one proxy in front of the API.
- The JWT key pair is mounted read-only from `apps/api/keys`.

::: tip Linux
The container runs as uid 1000 and the private key has mode 600. If your own uid is not 1000, the
API cannot read the key and exits. Either `chown 1000 apps/api/keys/*.pem`, or pass the keys as
`JWT_PRIVATE_KEY` and `JWT_PUBLIC_KEY` instead.
:::

Stop the stack with the profile too, or the application containers are left running:

```bash
docker compose --profile app down
```

## The API image

`docker/api.Dockerfile`, built from the repository root:

```bash
docker build -f docker/api.Dockerfile -t bossbyte-api .
```

It is one image with three commands:

| Command                | Process                                |
| ---------------------- | -------------------------------------- |
| `node dist/server.js`  | The HTTP API (the default)             |
| `node dist/worker.js`  | The background worker                  |
| `node dist/migrate.js` | Applies pending migrations, then exits |

`node dist/seed.js` and `node dist/rotate-keys.js` are in the image as well.

The build has four stages:

1. **pruner** runs `turbo prune @bossbyte/api --docker`, cutting the monorepo down to the API and
   the workspaces it depends on.
2. **builder** installs everything with `npm ci` and bundles with tsdown.
3. **deps** installs production dependencies only.
4. **runner** is `node:26-slim` with the bundle, the production `node_modules` and the
   `migrations` folder.

What you get:

- It runs as the unprivileged `node` user, and the files are owned by root, so the process cannot
  modify its own code.
- `NODE_ENV=production` and `PORT=4000` are set. Everything else comes from the environment. No
  `.env` file or key is in the image: `.dockerignore` keeps them out of the build context.
- The health check calls `GET /health`.
- On `SIGTERM` the API stops accepting connections and lets requests in flight finish, and the
  worker lets running jobs finish. Both exit on their own within 25 seconds. `docker-compose.yml` sets
  `stop_grace_period: 30s` to allow for that; Docker's default is 10 seconds, after which it
  kills the container.

Configure it with the variables under [Environment variables](/guide/environment#api-apps-api-env).
In a container, pass the JWT keys as base64 in `JWT_PRIVATE_KEY` and `JWT_PUBLIC_KEY` rather than
mounting files.

For the worker, set `WORKER_HEALTH_PORT` if your platform needs an HTTP health check. The worker
then answers `GET /health` on that port.

## The dashboard image

`docker/core.Dockerfile` builds the dashboard with Vite and serves it with `nginx:1.31-alpine`.

```bash
docker build -f docker/core.Dockerfile -t bossbyte-core \
  --build-arg VITE_API_URL=/api/v1 .
```

### Build arguments

Vite inlines `VITE_*` variables when it builds, so they are build arguments and not runtime
environment. Changing one means building the image again.

| Argument                    | Default   |
| --------------------------- | --------- |
| `VITE_API_URL`              | `/api/v1` |
| `VITE_FIREBASE_API_KEY`     | empty     |
| `VITE_FIREBASE_AUTH_DOMAIN` | empty     |
| `VITE_FIREBASE_PROJECT_ID`  | empty     |
| `VITE_FIREBASE_APP_ID`      | empty     |

None of these may hold a secret. They end up in JavaScript sent to every browser. (A Firebase web
API key is a public identifier, not a credential.)

### Runtime environment

| Variable                  | Default            | Notes                             |
| ------------------------- | ------------------ | --------------------------------- |
| `PORT`                    | `8080`             | Port Nginx listens on             |
| `API_UPSTREAM`            | `http://api:4000`  | Where `/api/` is proxied to       |
| `CONTENT_SECURITY_POLICY` | See the Dockerfile | Replaces the whole default policy |

The Nginx configuration is `docker/nginx/default.conf.template`, rendered with these values when
the container starts.

### What Nginx does

- **Serves the API on the same origin.** `/api/` is proxied to `API_UPSTREAM`. The browser only
  ever talks to one origin, so there is no CORS to configure and the refresh cookie stays
  first-party. This is the arrangement to keep in any deployment.
- **Single-page routing.** Any path that is not a file returns `index.html`.
- **Caching.** Files under `/assets/` are fingerprinted by Vite and cached for a year as
  immutable. `index.html` is always revalidated, so a deploy takes effect on the next page load.
- **Security headers** from `docker/nginx/security-headers.conf`, including the
  Content-Security-Policy. `Strict-Transport-Security` is sent only when the request arrived over
  HTTPS according to `X-Forwarded-Proto`. See [Security](/api/security#http-headers).
- **Uploads.** `client_max_body_size` is 12 MB, a little over the API's 10 MB limit, so the API's
  own error message is the one users see.
- **Health.** `GET /healthz` answers `ok` without touching the API.
- **Starts without the API.** The upstream is resolved at request time, so the container comes up
  even if the API is not reachable yet.

TLS is expected to be terminated in front of the container, by a load balancer or the platform.

If you add a third-party script, font, map tile host or API to the dashboard, add its origin to
the policy. The default already allows images over `https:`, which covers the OpenStreetMap tiles
the map page loads.

## Deploying with Compose

The compose file is a development tool. To run the images on a server of your own, write a
separate compose file or use your orchestrator, and change at least this:

- Use a managed or properly secured PostgreSQL and Redis, with real credentials.
- Use real object storage (S3 or Google Cloud Storage) instead of MinIO.
- Generate fresh secrets and keys. Do not copy your local `apps/api/.env`.
- Set `APP_URL` to the public URL and `WEBAUTHN_RP_ID` to its host name.
- Set `TRUST_PROXY` to the number of proxies in front of the API.
- Run `node dist/migrate.js` to completion before starting the new API and worker.
- Scale the API by adding containers. Raise the worker's throughput with `WORKER_CONCURRENCY`
  before adding worker containers.

The [production checklist](/api/security#before-you-go-to-production) has the rest.
