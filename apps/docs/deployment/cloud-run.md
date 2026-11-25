# Google Cloud Run

`.github/workflows/deploy-dev.yml` builds the two Docker images and deploys them to Cloud Run as
a `dev` environment. It runs on every push to `develop`, and by hand from the Actions tab.

::: warning This workflow has not been run
The workflow was written with the starter and has never been run against a Google Cloud
project. This page describes what the YAML does. Expect to adjust it on the first deploy, and
read [What to check on the first run](#what-to-check-on-the-first-run) before you rely on it.
:::

## What it deploys

| Name                   | Kind    | Image | Reachable from | What it is                                                 |
| ---------------------- | ------- | ----- | -------------- | ---------------------------------------------------------- |
| `bossbyte-core-dev`    | Service | core  | The internet   | Nginx. Serves the dashboard and proxies `/api/` to the API |
| `bossbyte-api-dev`     | Service | api   | The internet   | The Express API                                            |
| `bossbyte-worker-dev`  | Service | api   | Internal only  | The background worker, one instance that is always on      |
| `bossbyte-migrate-dev` | Job     | api   | —              | Runs `node dist/migrate.js` and exits                      |

The images are the ones described under [Docker](/deployment/docker). People open the dashboard
service. Their browser only ever talks to that origin, and Nginx forwards `/api/` to the API
service.

PostgreSQL, Redis and the storage bucket are **not** created by the workflow. You provide them
and give the workflow their addresses as secrets and variables.

## One-time setup

The same list is in the comment at the top of the workflow file.

### In Google Cloud

1. Enable the Cloud Run, Artifact Registry, Secret Manager and IAM Credentials APIs.
2. Create a Docker repository in Artifact Registry. The workflow expects the name `bossbyte`
   unless you set `GAR_REPOSITORY`.
3. Set up Workload Identity Federation for the GitHub repository, following the
   [`google-github-actions/auth` setup guide](https://github.com/google-github-actions/auth#setup),
   and create a **deploy** service account with these roles:
   - `roles/run.admin`
   - `roles/artifactregistry.writer`
   - `roles/iam.serviceAccountUser` on the runtime service account
   - `roles/browser`, to read the project number
4. Create a **runtime** service account, which the containers run as, with:
   - `roles/secretmanager.secretAccessor`
   - `roles/storage.objectAdmin` on the bucket
   - `roles/iam.serviceAccountTokenCreator` on itself, which signed download URLs need
5. Create a Cloud Storage bucket for uploaded files.
6. Create these secrets in Secret Manager. The workflow reads the `latest` version of each:

   | Secret                             | Value                                         | Becomes               |
   | ---------------------------------- | --------------------------------------------- | --------------------- |
   | `bossbyte-dev-database-url`        | `postgres://user:password@host:5432/bossbyte` | `DATABASE_URL`        |
   | `bossbyte-dev-redis-url`           | `redis://host:6379`                           | `REDIS_URL`           |
   | `bossbyte-dev-jwt-private-key`     | Base64 of the RS256 private key PEM           | `JWT_PRIVATE_KEY`     |
   | `bossbyte-dev-jwt-public-key`      | Base64 of the RS256 public key PEM            | `JWT_PUBLIC_KEY`      |
   | `bossbyte-dev-csrf-secret`         | At least 32 random characters                 | `CSRF_SECRET`         |
   | `bossbyte-dev-data-encryption-key` | Base64 of 32 random bytes                     | `DATA_ENCRYPTION_KEY` |
   | `bossbyte-dev-blind-index-key`     | Base64 of 32 random bytes                     | `BLIND_INDEX_KEY`     |

`npm run setup` generates values of the right shape for local use. Generate new ones for the
deployed environment and do not reuse your local ones. To encode a key file:

```bash
base64 < apps/api/keys/jwt-private.pem | tr -d '\n'
```

### In GitHub

The workflow reads repository **variables**, not secrets. None of them is confidential. Set them
under **Settings → Secrets and variables → Actions → Variables**. Both jobs also name the GitHub
environment `dev`, which GitHub creates on the first run if it does not exist.

Required:

| Variable                         | Example                                                                           |
| -------------------------------- | --------------------------------------------------------------------------------- |
| `GCP_PROJECT_ID`                 | `my-project`                                                                      |
| `GCP_REGION`                     | `asia-southeast1`                                                                 |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | `projects/123/locations/global/workloadIdentityPools/<pool>/providers/<provider>` |
| `GCP_DEPLOY_SERVICE_ACCOUNT`     | `deployer@my-project.iam.gserviceaccount.com`                                     |
| `DEV_RUNTIME_SERVICE_ACCOUNT`    | `bossbyte-dev@my-project.iam.gserviceaccount.com`                                 |
| `DEV_GCS_BUCKET`                 | The bucket for uploaded files                                                     |

Optional:

| Variable                                                                                                                 | What it does                                                               |
| ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `GAR_REPOSITORY`                                                                                                         | The Artifact Registry repository. Default `bossbyte`                       |
| `DEV_APP_URL`                                                                                                            | The public dashboard URL, when it has a custom domain                      |
| `DEV_TRUST_PROXY`                                                                                                        | How many proxies sit in front of the API. Default `3`                      |
| `DEV_VPC_NETWORK`, `DEV_VPC_SUBNET`                                                                                      | Direct VPC egress, to reach Memorystore or a private Cloud SQL address     |
| `DEV_CLOUDSQL_INSTANCE`                                                                                                  | `project:region:instance`, to mount the Cloud SQL socket                   |
| `DEV_EXTRA_ENV_VARS`                                                                                                     | More API settings, as `KEY=value,KEY=value`                                |
| `DEV_EXTRA_SECRETS`                                                                                                      | More secrets, as `ENV_NAME=secret-name:latest,ENV_NAME=secret-name:latest` |
| `DEV_VITE_FIREBASE_API_KEY`, `DEV_VITE_FIREBASE_AUTH_DOMAIN`, `DEV_VITE_FIREBASE_PROJECT_ID`, `DEV_VITE_FIREBASE_APP_ID` | Built into the dashboard to turn on Google sign-in                         |

The deploy job stops with an error if the project, region, runtime service account or bucket
variable is empty.

## What a run does

### 1. Build

One job per image (`api` and `core`), in parallel. Each signs in to Google Cloud through
Workload Identity Federation, so there is no service account key in GitHub. It builds
`docker/<app>.Dockerfile` from the repository root and pushes two tags to Artifact Registry:

```text
<region>-docker.pkg.dev/<project>/<repository>/<app>:<commit sha>
<region>-docker.pkg.dev/<project>/<repository>/<app>:dev
```

The dashboard build receives `VITE_API_URL=/api/v1` and the four `VITE_FIREBASE_*` values as
build arguments. Layers are cached in the GitHub Actions cache.

### 2. Work out the settings

The deploy job computes the two URLs before the services exist, using Cloud Run's
deterministic URL format:

```text
https://bossbyte-api-dev-<project number>.<region>.run.app
https://bossbyte-core-dev-<project number>.<region>.run.app
```

That lets each service be configured with the other's address in a single pass. `APP_URL` is
`DEV_APP_URL` when you set it, and the dashboard's deterministic URL otherwise.

The API, the worker and the migration job all get the same environment:

| Setting                        | Value                                             |
| ------------------------------ | ------------------------------------------------- |
| `NODE_ENV`                     | `production`                                      |
| `LOG_LEVEL`                    | `info`                                            |
| `APP_URL`                      | The dashboard's URL                               |
| `WEBAUTHN_RP_ID`               | The host name of `APP_URL`                        |
| `TRUST_PROXY`                  | `DEV_TRUST_PROXY`, or `3`                         |
| `STORAGE_DRIVER`               | `gcs`                                             |
| `GCS_BUCKET`, `GCS_PROJECT_ID` | `DEV_GCS_BUCKET` and the project                  |
| The seven secrets              | From Secret Manager, as listed above              |
| Anything else                  | From `DEV_EXTRA_ENV_VARS` and `DEV_EXTRA_SECRETS` |

All three run as the runtime service account. With `DEV_VPC_NETWORK` set they also get
`--network`, `--subnet` and `--vpc-egress=private-ranges-only`, and with
`DEV_CLOUDSQL_INSTANCE` they get `--set-cloudsql-instances`.

### 3. Migrate

The workflow deploys the `bossbyte-migrate-dev` job with the new API image and the command
`node dist/migrate.js`, runs it straight away and waits for it. The job has no retries and a
10-minute limit. If it fails, the workflow stops here and nothing new is deployed.

The migration runs **before** the new code is live, so for a moment the old code runs against
the new schema. Write migrations the old version can live with. See
[Database](/api/database).

### 4. Deploy

| Service               | Command               | Access                             | Size                                                     |
| --------------------- | --------------------- | ---------------------------------- | -------------------------------------------------------- |
| `bossbyte-api-dev`    | `node dist/server.js` | Public                             | 1 CPU, 512 MiB, 0 to 3 instances                         |
| `bossbyte-worker-dev` | `node dist/worker.js` | Internal ingress, no public access | 1 CPU, 512 MiB, exactly 1 instance, CPU always allocated |
| `bossbyte-core-dev`   | Nginx                 | Public                             | 1 CPU, 256 MiB, 0 to 3 instances                         |

The worker is a Cloud Run _service_, and a service has to listen on a port. So the workflow
sets `WORKER_HEALTH_PORT=8080`, which makes the worker answer `GET /health` there. It keeps one
instance with `--no-cpu-throttling`, because the queue needs a connection to Redis that stays
open. A comment in the workflow names Cloud Run worker pools as the alternative: the same image
and command, without `WORKER_HEALTH_PORT`.

The dashboard gets one setting, `API_UPSTREAM`, set to the API's URL.

### 5. Smoke test

Three requests, each retried up to five times:

| Request                        | What it shows                                    |
| ------------------------------ | ------------------------------------------------ |
| `<dashboard>/healthz`          | Nginx is serving                                 |
| `<api>/health/ready`           | The API can reach its database, Redis and bucket |
| `<dashboard>/api/openapi.json` | Nginx reaches the API                            |

Then it writes the commit and both URLs to the run summary. Open the dashboard at the URL
printed there.

`/health/ready` answers 200 with `"status": "degraded"` when only storage is unreachable, so
the smoke test also checks that the body says `"status":"ok"`. That shows the API can reach the
bucket, not that it may write to it: upload a file after the first deploy. See
[Health checks](/api/overview#health-checks).

## What the workflow does not do

- **It does not create the database, Redis or the bucket.**
- **It does not seed.** The database has the schema and no users. `node dist/seed.js` is in the
  API image, and with `NODE_ENV=production` it refuses to run without a `SEED_PASSWORD` of your
  choosing. Nothing in the workflow runs it.
- **It does not roll back.** A failed step stops the run where it is. Every image is tagged
  with its commit, so an earlier one is still in the registry, but migrations that were applied
  stay applied.
- **It does not set up email.** `SMTP_HOST` defaults to `localhost`, which is nothing inside
  Cloud Run. Pass your mail server through `DEV_EXTRA_ENV_VARS` (`SMTP_HOST`, `SMTP_PORT`,
  `SMTP_SECURE`, `SMTP_USER`, `MAIL_FROM`) and `DEV_EXTRA_SECRETS` (`SMTP_PASSWORD`).
- **It does not configure Google sign-in on the API.** The `DEV_VITE_FIREBASE_*` variables only
  build the button into the dashboard. The API needs `FIREBASE_PROJECT_ID`,
  `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` as well, through the same two variables.
- **It deploys one environment.** There is no staging or production workflow.

Two runs never overlap. The workflow's concurrency group queues a second run instead of
cancelling the first, so a deploy is never stopped half-way through a migration.

## What to check on the first run

These are the assumptions the YAML makes. None has been confirmed against a real project.

- **The deterministic URLs.** The API's allowed origin, the passkey relying-party ID and
  Nginx's upstream are all derived from the computed URLs. Compare them with what Cloud Run
  shows for the services. Cloud Run also serves each service on a second, hash-based URL. The
  API only accepts browser requests from `APP_URL`, so use the URL in the run summary.
- **`TRUST_PROXY`.** The workflow comment counts three hops through the dashboard: Google's
  front end, Nginx, and Google's front end again. After the first deploy, sign in and look at
  the IP address in the audit log. If it is not yours, adjust `DEV_TRUST_PROXY`. Rate limiting
  uses the same address, so a wrong value can put every visitor in one bucket.
- **Nginx resolving the API.** The dashboard proxies to the API's public HTTPS URL and looks it
  up at request time through the container's DNS resolver. The third smoke-test request is the
  one that proves this works.
- **The worker.** It is deployed with internal ingress and a health port. Check its logs for
  `Worker started`, then queue an export from the reports page and see it complete.
- **Database connectivity.** `DATABASE_SSL` is `false` unless you set it. A database reached
  over a public address will usually need `DATABASE_SSL=true` in `DEV_EXTRA_ENV_VARS`. A private
  address needs the VPC variables or the Cloud SQL instance variable.
- **Shutdown time.** The API and worker give themselves up to 25 seconds to finish work after
  `SIGTERM`, but Cloud Run stops a container 10 seconds after sending it. Requests and jobs
  that need longer than that are cut off; a job that was cut off is retried by the queue.
- **Cold starts.** The API scales to zero, so the first request after a quiet period waits for
  a container. Raise `--min-instances` in the workflow if that matters.

## Variations

**A custom domain.** Map the domain to the dashboard service, then set `DEV_APP_URL` to it and
run the workflow again. `APP_URL` and `WEBAUTHN_RP_ID` follow. Passkeys are bound to the host
name, so ones registered on the old address stop working.

**Another environment.** Copy the workflow, change the trigger, the four names under `env:`,
the secret names and the `DEV_` variables. Give each environment its own secrets, database and
bucket.

**Deploying a chosen commit.** Run the workflow by hand and pick the branch. The images are
tagged with that commit's SHA.
