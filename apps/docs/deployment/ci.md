# CI and releases

The repository comes with five GitHub Actions workflows, a Dependabot configuration and two
scripts they use.

| File                               | Name         | Runs on                                                                     |
| ---------------------------------- | ------------ | --------------------------------------------------------------------------- |
| `.github/workflows/ci.yml`         | CI           | Pull requests, pushes to `main` and `develop`, by hand                      |
| `.github/workflows/codeql.yml`     | CodeQL       | The same, plus Mondays at 03:17 UTC                                         |
| `.github/workflows/e2e.yml`        | E2E          | By hand                                                                     |
| `.github/workflows/release.yml`    | Release      | By hand, on `main`                                                          |
| `.github/workflows/deploy-dev.yml` | Deploy (dev) | Pushes to `develop`, by hand. See [Google Cloud Run](/deployment/cloud-run) |

::: warning The workflows have not been run on GitHub
The commands each job runs are the root scripts you run locally. The workflows themselves were
written with the starter and have never been run on GitHub. This page
describes what the YAML does. Expect small fixes on the first run.
:::

## The shared setup step

Every job that needs Node.js starts with the composite action in
`.github/actions/setup/action.yml`:

```yaml
steps:
  - uses: actions/checkout@v7
  - uses: ./.github/actions/setup
```

It does three things:

1. Installs the Node.js version in `.nvmrc` (26) and restores the npm cache.
2. Installs the npm version named in the root `package.json` under `packageManager`. The npm
   that ships with Node.js can be older than the one the lockfile was written with.
3. Runs `npm ci`.

Pass `install: 'false'` to skip step 3 in a job that only needs the lockfile:

```yaml
- uses: ./.github/actions/setup
  with:
    install: 'false'
```

Use the action in any workflow you add, so the versions are set in one place.

## The CI workflow

Eight jobs, all independent, all run in parallel:

| Job           | Name on GitHub     | Command                                     |
| ------------- | ------------------ | ------------------------------------------- |
| `lint`        | Lint and format    | `npm run format:check`, then `npm run lint` |
| `typecheck`   | Type-check         | `npm run typecheck`                         |
| `test`        | Unit tests         | `npm run test`                              |
| `integration` | Integration tests  | `npm run test:integration`                  |
| `build`       | Build              | `npm run build`                             |
| `audit`       | Security audit     | `npm audit --omit=dev --audit-level=high`   |
| `knip`        | Unused code (Knip) | `npm run knip`                              |
| `licenses`    | Licence check      | `npm run licenses`                          |

To reproduce a failure, run the same command locally. See [Scripts](/guide/scripts).

Things worth knowing about individual jobs:

- **Unit tests** runs `vitest run` in the API, the dashboard and both packages. None of these
  tests needs a database.
- **Integration tests** starts `postgres:16-alpine` and `redis:7-alpine` as service containers
  and points the tests at them with `DATABASE_URL` and `REDIS_URL`. The database is named
  `bossbyte_test` and Redis uses index 1, which satisfies the tests' disposable-database guard. The test run applies
  the migrations itself. See [API integration tests](/testing#api-integration-tests).
- **Build** builds every workspace, this documentation site included. A dead link in the docs
  fails it.
- **Security audit** checks production dependencies only, and fails on advisories rated high
  or critical. It reads the lockfile, so it skips `npm ci`.
- **Unused code** fails on files, exports and dependencies that nothing uses. Its settings are
  in `knip.json`.

The workflow has read-only access to the repository. A new push to a pull request cancels the
run for the previous push. Runs on `main` and `develop` always finish.

### Make the jobs required

The workflow cannot block a merge by itself. In the repository's branch protection rules or
rulesets for `main`, mark each of the eight jobs as a required status check. GitHub lists them
by the names in the second column.

### Add a job

Copy an existing one. Keep `timeout-minutes`, so a hung job does not use up minutes:

```yaml
my-check:
  name: My check
  runs-on: ubuntu-latest
  timeout-minutes: 10
  steps:
    - uses: actions/checkout@v7
    - uses: ./.github/actions/setup
    - run: npm run my-check
```

Then add it to the required checks.

## Licence check

`npm run licenses` runs `scripts/check-licenses.mjs`. It fails when a dependency that ships to
production has a licence that is not on the allow-list.

```bash
npm run licenses                    # check production dependencies
npm run licenses -- --summary       # also print how many packages use each licence
npm run licenses -- --include-dev   # also check devDependencies
```

It takes the list of production packages from `package-lock.json`, for every platform and not
only yours. It reads each licence from the installed package. A package that is not installed
on your machine, such as a binary for another operating system, is judged by the licence
recorded in the lockfile.

The allow-list is the `ALLOWED` set at the top of the script. All of them are permissive:

```text
0BSD  Apache-2.0  BlueOak-1.0.0  BSD-2-Clause  BSD-3-Clause  CC-BY-4.0  CC0-1.0
ISC  MIT  MIT-0  Python-2.0  Unlicense  Zlib
```

With `--include-dev`, devDependencies may also use `CC-BY-3.0` and `MPL-2.0`. They are build
and test tools and are never distributed.

An SPDX expression is evaluated: `MIT OR GPL-3.0` passes because one side is allowed, and
`MIT AND GPL-3.0` fails because both sides have to be.

### Exceptions

A package can be accepted despite its licence through the `EXCEPTIONS` list, with a written
reason. The starter has five:

| Package                                | Licence                                  | Why                                                                           |
| -------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------- |
| `@img/sharp-libvips-*`                 | LGPL-3.0-or-later                        | Prebuilt libvips binaries that sharp loads as a separate, replaceable library |
| `@img/sharp-win32-*`                   | Apache-2.0 AND LGPL-3.0-or-later         | sharp for Windows ships the libvips DLLs                                      |
| `@img/sharp-wasm32`                    | Apache-2.0 AND LGPL-3.0-or-later AND MIT | sharp for WebAssembly links libvips                                           |
| `react-leaflet`, `@react-leaflet/core` | Hippocratic-2.1                          | The map library. Not an OSI-approved licence                                  |
| `buffers`                              | Unknown                                  | Published without licence metadata. Reached through exceljs                   |

::: warning Two exceptions are waiting for a decision
The script marks `react-leaflet` as **needing legal review before a commercial release**, and
`buffers` as needing review. They are accepted so the check passes, not because someone has
cleared them. For the first, the way out is described under
[The react-leaflet licence](/frontend/charts-and-maps#the-react-leaflet-licence).
:::

An exception applies only while the package reports exactly the licence written next to it. If
the licence changes upstream, the package is flagged again. An exception that no longer matches
any package prints a warning asking you to remove it.

### When it fails

The output names each package and its licence. You have three choices:

1. Replace the dependency.
2. Add the licence to `ALLOWED`, if your organisation accepts it for everything.
3. Add the package to `EXCEPTIONS` with the reason.

Have the second and third reviewed by whoever answers for licensing where you work.

## CodeQL

`codeql.yml` runs GitHub's static security analysis on the TypeScript and JavaScript sources,
with the `security-extended` query set. There is no build step. Findings appear under
**Security → Code scanning**.

It runs on pull requests and on pushes to `main` and `develop`. It also runs every Monday, so
new queries are applied even when the code has not changed.

Code scanning is free for public repositories. A private repository needs GitHub Advanced
Security, and without it the upload step fails. If you do not have it, delete the workflow.

## End-to-end tests

`e2e.yml` runs the Playwright suite. It is started by hand: **Actions → E2E → Run workflow**.
A comment in the file suggests adding a `pull_request` trigger once the suite is stable enough
to gate merges.

The steps:

1. `docker compose up --detach --wait postgres redis mailpit`
2. `npm run setup`, which creates the `.env` files and keys
3. `npm run db:migrate` and `npm run db:seed`
4. `npx playwright install --with-deps chromium`
5. `npm run test:e2e`

Playwright starts the API and the dashboard through the `webServer` setting in
`playwright.config.ts`, so the workflow does not. On CI a failed test is retried once.

The HTML report and the `test-results/` folder are uploaded as an artifact named
`playwright-report` and kept for 7 days, whether or not the run passed. When the run fails, the
last 200 lines of each service's log are printed.

MinIO is not started. The two specs in `e2e/` do not upload files. A spec that does needs
`minio` and `minio-init` added to the first step. See [End-to-end tests](/testing#end-to-end-tests).

## Releases

One version number covers the whole repository. The **Release** workflow sets it, tags it and
publishes a GitHub release.

Run it from the Actions tab, on `main`, with one input:

| `version`                              | Result              |
| -------------------------------------- | ------------------- |
| `patch` (the default)                  | 1.4.0 becomes 1.4.1 |
| `minor`                                | 1.4.0 becomes 1.5.0 |
| `major`                                | 1.4.0 becomes 2.0.0 |
| An exact version, such as `2.0.0-rc.1` | Set as written      |

It then:

1. Stops with an error unless it was started on `main`.
2. Runs `node scripts/stamp-version.mjs <version>`, which writes the version into the root
   `package.json`, every workspace `package.json` and `package-lock.json`.
3. Stops if the tag `v<version>` already exists.
4. Commits as `chore(release): v<version>`, creates the annotated tag, and pushes both with
   `git push --atomic`, so the commit and the tag land together or not at all.
5. Runs `gh release create` with generated notes. A version with a hyphen, such as
   `2.0.0-rc.1`, is published as a pre-release.

The workflow does not build or deploy anything, and it does not publish packages to npm.

### If `main` is protected

The default workflow token cannot push to a protected branch. Add a repository secret named
`RELEASE_TOKEN`: a fine-grained personal access token or a GitHub App token with **Contents:
read and write** that is allowed to bypass the protection. The workflow uses it for the
checkout, and so for the push, when it exists.

There is a second reason to add it. A push made with the default token does not start other
workflows, so CI would not run on the release commit.

### Release notes

GitHub generates the notes from the pull requests merged since the previous tag.
`.github/release.yml` groups them by label. A pull request goes into the first group whose
label it has:

| Label                      | Group            |
| -------------------------- | ---------------- |
| `breaking`                 | Breaking changes |
| `security`                 | Security         |
| `feature`, `enhancement`   | Features         |
| `bug`, `fix`               | Fixes            |
| `documentation`            | Documentation    |
| `dependencies`             | Dependencies     |
| Anything else, or no label | Other changes    |

A pull request labelled `skip-changelog` is left out. Label pull requests when you merge them,
and the notes need no editing.

### Stamping a version by hand

```bash
npm run version:stamp -- minor --dry-run   # show what would change
npm run version:stamp -- 1.4.0             # write it
```

The script only edits files. It does not commit, tag or publish. A bump drops any pre-release
tag, so `patch` turns `1.4.0-rc.1` into `1.4.1`. It refuses a version that is not valid semver,
and one that is the same as the current version.

## Dependency updates

`.github/dependabot.yml` asks Dependabot for updates every Monday:

| What                                   | Where                              | Commit prefix   |
| -------------------------------------- | ---------------------------------- | --------------- |
| npm packages                           | `/`, which covers every workspace  | `chore(deps)`   |
| GitHub Actions                         | The workflows and the setup action | `chore(ci)`     |
| Base images in the Dockerfiles         | `/docker`                          | `chore(docker)` |
| Service images in `docker-compose.yml` | `/`                                | `chore(docker)` |

For npm, minor and patch updates arrive as two grouped pull requests, one for production
dependencies and one for development dependencies. Each major version gets a pull request of
its own, so it can be reviewed separately. At most 10 npm pull requests are open at a time.
Updates to GitHub Actions arrive as one group.

Every pull request gets the `dependencies` label, which puts it in the right group of the
release notes. Each one runs the CI workflow like any other, licence check included.
