# BossByte

A full-stack TypeScript monorepo boilerplate: an Express 5 API with a background
worker, a React 19 dashboard, a shared component library and shared validation
schemas, wired together with Turborepo.

## Quick start

You need Node.js 26 and Docker. Then:

```bash
nvm install && npm install
npm run setup              # .env files, JWT key pair, encryption keys
npm run docker:up          # PostgreSQL, Redis, MinIO, Mailpit, pgAdmin
npm run db:migrate && npm run db:seed
npm run dev
```

Open <http://localhost:5173> and sign in as `admin@bossbyte.local` with the
password `BossByte-Dev-2026`.

The full walkthrough, including troubleshooting, is in
[INSTALLATION.md](./INSTALLATION.md).

## What is inside

```text
apps/
  api/      Express 5 API and Bull worker           http://localhost:4000
  core/     React 19 dashboard (Vite)               http://localhost:5173
  docs/     Documentation site (VitePress)          http://localhost:5174
packages/
  shared/   @bossbyte/shared: Zod schemas, types, roles, permissions
  ui/       @bossbyte/ui: BossByte UI, the React component library
docker/     Dockerfiles, Nginx and PostgreSQL configuration
scripts/    Setup, licence check and version stamping
e2e/        Playwright tests
```

| Area         | Stack                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------ |
| Tooling      | Turborepo, npm workspaces, TypeScript 5 (strict, ESM), ESLint 10, Prettier 3, Knip               |
| API          | Express 5, PostgreSQL 16 with Drizzle ORM and SQL migrations, Redis 7, Bull queues, Zod 4, Pino  |
| Auth         | RS256 JWTs with refresh-token rotation, bcrypt, TOTP 2FA, WebAuthn passkeys, Firebase (optional) |
| Security     | helmet, CSRF (csrf-csrf), Redis-backed rate limits, CORS, AES-256-GCM column encryption          |
| Files        | S3-compatible storage (MinIO locally) or Google Cloud Storage; multer, sharp, file-type          |
| Documents    | PDF (pdfkit, pdfmake), Excel and CSV (exceljs, csv-parse, fast-csv), zip (archiver), QR codes    |
| Valuation    | Regression, comparable sales, ratio studies and gradient-boosted trees in TypeScript (ml-matrix) |
| Dashboard    | React 19, Vite 8, TanStack Router and Query, Tailwind CSS 4, React Hook Form, Leaflet, Chart.js  |
| Component UI | Headless UI, TipTap, Framer Motion, react-datepicker, dayjs                                      |
| Testing      | Vitest 4, Supertest, Testing Library, vitest-axe, Playwright                                     |
| Deployment   | Docker Compose, node:26-slim and Nginx 1.31 images, PM2, Google Cloud Run, GitHub Actions        |

## Everyday commands

Run these from the repository root.

| Command                    | What it does                                                   |
| -------------------------- | -------------------------------------------------------------- |
| `npm run dev`              | Start the API, worker, dashboard and docs with live reload     |
| `npm run build`            | Build every app                                                |
| `npm run lint`             | ESLint across the monorepo                                     |
| `npm run typecheck`        | `tsc --noEmit` across the monorepo                             |
| `npm run test`             | Unit and component tests (no services needed)                  |
| `npm run test:integration` | API tests against PostgreSQL and Redis                         |
| `npm run test:e2e`         | Playwright browser tests                                       |
| `npm run format`           | Format everything with Prettier                                |
| `npm run knip`             | Report unused files, exports and dependencies                  |
| `npm run licenses`         | Check dependency licences against the allow-list               |
| `npm run docker:up`        | Start the local services (`docker:down` stops them)            |
| `npm run db:migrate`       | Apply pending SQL migrations                                   |
| `npm run db:seed`          | Create the demo accounts                                       |
| `npm run docs:dev`         | Start only the documentation site                              |
| `npm run setup`            | Create missing `.env` files, keys and secrets (safe to repeat) |

To run a script in one workspace, add `-w`, for example
`npm run test -w @bossbyte/ui`.

## Shared packages

Both packages ship TypeScript source and are compiled by whichever app imports
them, so there is no build step and no watch process to keep in sync.

```ts
// The same schema validates the request in the API and the form in the dashboard.
import { loginSchema, hasPermission, type User } from '@bossbyte/shared';

// Components, hooks and helpers.
import { Button, DataTable, Modal, useDebounce } from '@bossbyte/ui';
import '@bossbyte/ui/styles.css';
```

## Encryption at rest

Sensitive columns are encrypted in the application with AES-256-GCM before they
reach PostgreSQL, so a database dump or backup does not reveal them. Declaring
an encrypted column is one line in the Drizzle schema:

```ts
phone: encryptedText('users.phone')('phone'),
```

Exact-match lookups use a keyed hash stored beside the ciphertext (a blind
index), and keys can be rotated without downtime with
`npm run db:rotate-keys -w @bossbyte/api`. The documentation site explains the
format, the rotation steps and the limits of this approach.

## Documentation

`npm run docs:dev` serves the documentation at <http://localhost:5174>. It
covers the API modules, authentication, the database and encryption, background
jobs, storage, document generation, the valuation models, the dashboard, both
shared packages, testing and deployment.

While the API is running, its reference is at <http://localhost:4000/api/docs>
(Swagger UI) and <http://localhost:4000/api/openapi.json> (OpenAPI 3.1).

## Notes on dependencies

- **Versions.** Dependencies are on the latest release within the major version
  the project targets. Three are held back on purpose: TypeScript 5.9 and
  Vitest 4 (the project standard), and VitePress 1 (the current stable line).
- **PM2** is AGPL-3.0 licensed, so it is not an npm dependency. Install it on the
  host that needs it: `npm install --global pm2`.
- **Licences.** `npm run licenses` fails on any licence that is not on the
  allow-list in `scripts/check-licenses.mjs`. The documented exceptions there
  are worth a review before you ship a product on this base.
