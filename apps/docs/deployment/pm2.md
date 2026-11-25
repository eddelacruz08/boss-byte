# PM2

[PM2](https://pm2.keymetrics.io) runs BossByte on a single server or virtual machine without
containers. `ecosystem.config.cjs` at the repository root describes three processes:

| Process              | What it runs                            | Mode                             | Memory limit |
| -------------------- | --------------------------------------- | -------------------------------- | ------------ |
| `bossbyte-api`       | `apps/api/dist/server.js`               | Cluster, 2 instances on one port | 512 MB       |
| `bossbyte-worker`    | `apps/api/dist/worker.js`               | Fork, 1 instance                 | 768 MB       |
| `bossbyte-dashboard` | PM2's static server on `apps/core/dist` | Fork, 1 instance                 | 256 MB       |

A process that goes over its memory limit is restarted.

::: warning What has been tested
`ecosystem.config.cjs` was started once under PM2 7 with Node.js 26 on a development machine:
the three processes came up, and `pm2 reload` replaced the API instances without a failed
request. It has not run on a server, and the reverse proxy block below is an example, not a
tested configuration. Try the whole procedure on a test server before you depend on it.
:::

## What the server needs

- Node.js 26 and npm 11.
- PostgreSQL 16, Redis 7 and an S3-compatible bucket or a Google Cloud Storage bucket, reachable
  from the server.
- A reverse proxy (Nginx, Caddy, a load balancer) that terminates TLS.
- PM2, installed globally:

```bash
npm install --global pm2
```

PM2 is licensed under AGPL-3.0, so it is deliberately **not** a dependency of this repository and
would fail the [licence check](/deployment/ci#licence-check) if you added it. Install it on the
host.

## First deploy

```bash
git clone <your-repository-url> bossbyte
cd bossbyte
npm ci
npm run setup
```

`npm run setup` creates `apps/api/.env` and `apps/core/.env`, and generates the JWT key pair and
the random secrets. The generated files point at `localhost` services, so edit `apps/api/.env`
before going further. At the least:

```ini
APP_URL=https://app.example.com
WEBAUTHN_RP_ID=app.example.com
TRUST_PROXY=1

DATABASE_URL=postgres://user:password@db.internal:5432/bossbyte
REDIS_URL=redis://redis.internal:6379

STORAGE_DRIVER=s3
S3_BUCKET=your-bucket
S3_REGION=ap-southeast-1
# Remove S3_ENDPOINT and S3_FORCE_PATH_STYLE; they are for the local MinIO.

SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASSWORD=...
MAIL_FROM=BossByte <no-reply@example.com>
```

Every variable is described under [Environment variables](/guide/environment). Keep the generated
`DATA_ENCRYPTION_KEY` and `BLIND_INDEX_KEY` somewhere safe outside the server as well: without
them the encrypted columns cannot be read.

Then build, migrate and start:

```bash
npm run build
npm run db:migrate
pm2 start ecosystem.config.cjs --env production
```

`--env production` sets `NODE_ENV=production` for the API and the worker. Everything else comes
from `apps/api/.env`. Variables in the real environment win over the file.

Check that it is up:

```bash
pm2 status
curl http://localhost:4000/health/ready
```

Make it survive a reboot:

```bash
pm2 save
pm2 startup   # prints a command to run once, with sudo
```

### The dashboard's settings

The dashboard's `VITE_*` variables are read from `apps/core/.env` **when you run
`npm run build`**, not when PM2 starts. Leave `VITE_API_URL` at `/api/v1` and let the reverse
proxy put the API on the same origin. Change a value, then build again.

### Demo accounts

`npm run db:seed` creates the four demo accounts. With `NODE_ENV=production` it refuses to use the
well-known development password, so choose one:

```bash
NODE_ENV=production SEED_PASSWORD='Choose-A-Password-1' npm run db:seed
```

On a real deployment you probably want one administrator instead. Seed, sign in as the admin,
create your own account, then delete the demo ones.

## The reverse proxy

The proxy must send `/api/` to the API and everything else to the dashboard, so the browser sees
**one origin**. That keeps the refresh cookie first-party and means there is no CORS to configure.

An Nginx server block that does it:

```nginx
server {
  listen 443 ssl;
  server_name app.example.com;
  # ssl_certificate and ssl_certificate_key go here

  client_max_body_size 12m;

  location /api/ {
    proxy_pass http://127.0.0.1:4000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }

  location / {
    proxy_pass http://127.0.0.1:5173;
    proxy_set_header Host $host;
  }
}
```

Three things to get right:

- **`TRUST_PROXY=1`** in `apps/api/.env`, for the one proxy in front of the API. Without it every
  request appears to come from `127.0.0.1`, and all your users share one rate limit.
- **`client_max_body_size`** a little above the API's 10 MB upload limit.
- **Security headers for the dashboard.** The API sets its own, but PM2's static server sets
  none. Add the headers from `docker/nginx/security-headers.conf` to the `location /` block,
  including a Content-Security-Policy. The default policy is in `docker/core.Dockerfile`.

Do not expose ports 4000 and 5173 to the internet. Bind the firewall so only the proxy reaches
them.

## Deploying a new version

```bash
git pull
npm ci
npm run build
npm run db:migrate
pm2 reload ecosystem.config.cjs --env production
```

`reload` restarts the API instances one at a time, so there is always one serving requests. On
`SIGTERM` the API stops accepting connections and finishes the requests in flight, and the worker
finishes its running jobs. Both give up and exit on their own after 25 seconds
(`apps/api/src/lib/shutdown.ts`). The config sets one `kill_timeout` of 30 seconds for the API and
the worker, so PM2 does not have to kill either.

Run migrations **before** the reload, and write them so the previous version of the code still
works against the new schema. During the reload both versions are serving. See
[Database](/api/database).

## Settings

The process file reads three variables from the environment of the `pm2` command:

| Variable         | Default  | Effect                                         |
| ---------------- | -------- | ---------------------------------------------- |
| `API_INSTANCES`  | `2`      | Number of API processes. `max` uses every core |
| `DASHBOARD_PORT` | `5173`   | Port of the static server                      |
| `PM2_LOG_DIR`    | `./logs` | Where the log files are written                |

```bash
API_INSTANCES=4 pm2 start ecosystem.config.cjs --env production
```

Running several API instances is safe because nothing that matters is held in process memory:
rate-limit counters, lockouts and WebAuthn challenges are in Redis.

The worker stays at one instance. Its parallelism is `WORKER_CONCURRENCY` in `apps/api/.env`.

## Logs and monitoring

```bash
pm2 logs                  # follow everything
pm2 logs bossbyte-api     # one process
pm2 monit                 # live CPU and memory
```

Files are written to `logs/`: `api.out.log`, `api.error.log`, `worker.out.log`,
`worker.error.log`, `dashboard.out.log` and `dashboard.error.log`. PM2 does not rotate them by
itself:

```bash
pm2 install pm2-logrotate
```

In production the API logs one JSON object per line (Pino), ready for a log shipper. See
[Security](/api/security#logging).

A process that keeps crashing is restarted with an increasing delay, and PM2 gives up after 20
restarts that each lasted under 10 seconds. `pm2 status` shows it as `errored`; the reason is in
the error log. The usual cause on a first deploy is an invalid environment: the API prints every
problem with `apps/api/.env` and exits.

## Common commands

| Command                                            | Effect                        |
| -------------------------------------------------- | ----------------------------- |
| `pm2 status`                                       | List the processes            |
| `pm2 reload ecosystem.config.cjs --env production` | Zero-downtime restart         |
| `pm2 restart bossbyte-worker`                      | Restart one process           |
| `pm2 stop ecosystem.config.cjs`                    | Stop everything               |
| `pm2 delete ecosystem.config.cjs`                  | Stop and forget the processes |
