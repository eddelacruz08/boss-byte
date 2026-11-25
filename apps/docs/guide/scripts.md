# Scripts

Run root scripts from the repository root. To run a workspace script from the root, add
`-w <workspace>`:

```bash
npm run test -w @bossbyte/api
npm run db:rotate-keys -w @bossbyte/api -- --dry-run
```

Everything after a bare `--` is passed to the script itself.

## Root

| Script                     | What it does                                                                    |
| -------------------------- | ------------------------------------------------------------------------------- |
| `npm run setup`            | Creates `.env` files, the JWT key pair and random secrets (`scripts/setup.mjs`) |
| `npm run dev`              | Starts every `dev` and `dev:worker` task: API, worker, dashboard and docs       |
| `npm run build`            | Builds every workspace through Turborepo                                        |
| `npm run lint`             | ESLint in every workspace                                                       |
| `npm run typecheck`        | `tsc --noEmit` in every workspace                                               |
| `npm run test`             | Unit and component tests in every workspace                                     |
| `npm run test:integration` | API integration tests against PostgreSQL and Redis                              |
| `npm run test:e2e`         | Playwright tests in `e2e/`                                                      |
| `npm run format`           | Prettier, writing changes                                                       |
| `npm run format:check`     | Prettier, check only                                                            |
| `npm run knip`             | Reports unused files, exports and dependencies                                  |
| `npm run licenses`         | Checks production dependency licences against the allow-list                    |
| `npm run version:stamp`    | Writes one version into every `package.json` (`scripts/stamp-version.mjs`)      |
| `npm run docker:up`        | Starts PostgreSQL, Redis, MinIO, Mailpit and pgAdmin                            |
| `npm run docker:down`      | Stops them                                                                      |
| `npm run db:migrate`       | Applies pending SQL migrations                                                  |
| `npm run db:seed`          | Creates the four demo accounts                                                  |
| `npm run docs:dev`         | Starts only this documentation site                                             |
| `npm run clean`            | Removes build output and caches in every workspace                              |

Useful variations:

```bash
npm run setup -- --force                    # new JWT key pair and CSRF secret (signs everyone out)
npm run setup -- --rotate-encryption-key    # new data key; the old one becomes a previous key
npm run setup -- --help

npm run db:migrate -- status                # list applied and pending migrations

npm run licenses -- --summary               # licence counts instead of pass/fail
npm run licenses -- --include-dev           # check devDependencies too

npm run version:stamp -- 1.4.0              # exact version
npm run version:stamp -- minor              # or major | minor | patch
npm run version:stamp -- minor --dry-run
```

## `@bossbyte/api`

| Script                       | What it does                                                          |
| ---------------------------- | --------------------------------------------------------------------- |
| `dev`                        | `tsx watch src/server.ts`                                             |
| `dev:worker`                 | `tsx watch src/worker.ts`                                             |
| `build`                      | Bundles with tsdown into `dist/`                                      |
| `start`                      | `node dist/server.js`                                                 |
| `start:worker`               | `node dist/worker.js`                                                 |
| `db:migrate`                 | Applies migrations. `-- status` lists them                            |
| `db:seed`                    | Creates the demo accounts                                             |
| `db:rotate-keys`             | Re-encrypts rows held under a retired key. `-- --dry-run` only counts |
| `test`                       | Unit tests (`vitest.config.ts`)                                       |
| `test:integration`           | Integration tests (`vitest.int.config.ts`)                            |
| `lint`, `typecheck`, `clean` |                                                                       |

In a built image, the same commands exist as plain files: `node dist/migrate.js`,
`node dist/seed.js` and `node dist/rotate-keys.js`.

## `@bossbyte/core`

| Script                       | What it does                                 |
| ---------------------------- | -------------------------------------------- |
| `dev`                        | Vite dev server on port 5173                 |
| `build`                      | Production build into `dist/`                |
| `preview`                    | Serves the production build on port 5173     |
| `test`                       | Unit and component tests (Vitest with jsdom) |
| `lint`, `typecheck`, `clean` |                                              |

## `@bossbyte/ui` and `@bossbyte/shared`

Both have `lint`, `typecheck`, `test` and `clean`. Neither has a `build`: the apps compile them
from source.

## `@bossbyte/docs`

| Script    | What it does                       |
| --------- | ---------------------------------- |
| `dev`     | VitePress dev server on port 5174  |
| `build`   | Static site into `.vitepress/dist` |
| `preview` | Serves the built site              |
| `clean`   | Removes the build output and cache |

## How Turborepo runs them

`turbo.json` defines the pipeline:

- `build` runs after the `build` of every workspace it depends on, and caches `dist/**` and
  `.vitepress/dist/**`. `VITE_*` and `NODE_ENV` are part of the cache key, so changing a
  dashboard variable rebuilds it.
- `lint`, `typecheck` and `test` depend on a `transit` task. It has no script; it only makes a
  change in `packages/shared` or `packages/ui` invalidate the cached result of every workspace
  that imports them.
- `dev` and `dev:worker` are persistent and never cached.

To run one task in one workspace through Turborepo (with caching):

```bash
npx turbo run test --filter=@bossbyte/ui
```
