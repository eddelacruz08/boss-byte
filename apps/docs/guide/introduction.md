# Introduction

BossByte is a starting point for a full-stack TypeScript product. It is a Turborepo with an API, a
dashboard, two shared packages and this documentation site. Everything in it works end to end: you
can sign in, manage users, upload files, export reports and run the tests before you have written
a line of your own.

Use it by replacing the example modules with your own, and keeping the plumbing.

## What's in the box

| Workspace          | Path              | What it is                                                       |
| ------------------ | ----------------- | ---------------------------------------------------------------- |
| `@bossbyte/api`    | `apps/api`        | Express 5 REST API plus a Bull worker, bundled with tsdown       |
| `@bossbyte/core`   | `apps/core`       | React 19 dashboard built with Vite                               |
| `@bossbyte/docs`   | `apps/docs`       | This site (VitePress)                                            |
| `@bossbyte/shared` | `packages/shared` | Zod schemas, types, constants and pure helpers used by both apps |
| `@bossbyte/ui`     | `packages/ui`     | React components and hooks on Tailwind CSS 4 and Headless UI     |

The API ships with these modules, each of which is also an example of a pattern you will reuse:

- **Auth** — email and password, refresh-token sessions, TOTP two-factor, passkeys (WebAuthn) and
  optional Google sign-in through Firebase. See [Authentication](/api/authentication).
- **Users** — CRUD with pagination, search, role-based permissions and an encrypted phone column.
  See [Authorization](/api/authorization) and [Encryption](/api/encryption).
- **Files** — validated uploads to S3-compatible storage or Google Cloud Storage, served through
  signed URLs. See [File storage](/api/storage).
- **Reports** — cached dashboard statistics, PDF/Excel/CSV/ZIP exports, an import preview and
  exports built by the background worker. See [Documents and exports](/api/documents) and
  [Background jobs](/api/jobs).
- **Valuation** — four stateless statistical models (regression, comparable sales, ratio study and
  gradient-boosted trees). See [Valuation](/api/valuation).

## Stack

| Area             | Choice                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------- |
| Runtime          | Node.js 26 (`.nvmrc`), npm 11 workspaces                                                  |
| Monorepo         | Turborepo 2                                                                               |
| Language         | TypeScript 5.9, strict, ES modules everywhere                                             |
| API              | Express 5, Zod 4, Pino, Helmet, `express-rate-limit`, `csrf-csrf`                         |
| Database         | PostgreSQL 16, Drizzle ORM over `pg`, hand-written SQL migrations                         |
| Cache and queues | Redis 7 (`ioredis`), Bull                                                                 |
| Encryption       | AES-256-GCM column encryption (`node:crypto`), HMAC-SHA256 blind indexes                  |
| Auth             | RS256 JWTs, bcrypt, `otpauth`, `@simplewebauthn/server`, `firebase-admin` (optional)      |
| Storage          | AWS SDK v3 (S3, MinIO, R2, Spaces) or `@google-cloud/storage`                             |
| Uploads          | Multer, `file-type`, `sharp`                                                              |
| Documents        | PDFKit, pdfmake, ExcelJS, fast-csv, csv-parse, archiver, qrcode                           |
| Mail             | Nodemailer (Mailpit in development)                                                       |
| Dashboard        | React 19, Vite 8, TanStack Router and Query, React Hook Form, Tailwind CSS 4              |
| Dashboard extras | Chart.js, Leaflet (OpenStreetMap raster tiles), jsPDF, ExcelJS, DOMPurify, react-markdown |
| UI package       | Headless UI 2, TipTap 3, Framer Motion, react-datepicker, dayjs                           |
| Tests            | Vitest 4, Supertest, Testing Library, vitest-axe, Playwright                              |
| Tooling          | ESLint 10, Prettier 3, Knip, a licence checker, GitHub Actions, Dependabot, CodeQL        |
| Deployment       | Docker and Docker Compose, PM2, Google Cloud Run                                          |

## Local addresses

| What                    | Address                                |
| ----------------------- | -------------------------------------- |
| Dashboard               | http://localhost:5173                  |
| API                     | http://localhost:4000                  |
| API reference (Swagger) | http://localhost:4000/api/docs         |
| OpenAPI document        | http://localhost:4000/api/openapi.json |
| Documentation           | http://localhost:5174                  |
| Mailpit (caught email)  | http://localhost:8025                  |
| MinIO console           | http://localhost:9001                  |
| pgAdmin                 | http://localhost:5050                  |

## Demo accounts

`npm run db:seed` creates one account per role. They all share the password `BossByte-Dev-2026`.

| Email                    | Role    |
| ------------------------ | ------- |
| `admin@bossbyte.local`   | admin   |
| `manager@bossbyte.local` | manager |
| `staff@bossbyte.local`   | staff   |
| `viewer@bossbyte.local`  | viewer  |

## Where to go next

1. [Install it](/guide/installation) and sign in.
2. Skim the [project structure](/guide/project-structure) so you know where things live.
3. Follow [Conventions](/guide/conventions) to add your first module end to end.
