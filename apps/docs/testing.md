# Testing

There are four kinds of test. Each answers a different question, and each needs a different
amount of machinery.

| Kind        | Question it answers                               | Runs against                     | Command                    |
| ----------- | ------------------------------------------------- | -------------------------------- | -------------------------- |
| Unit        | Does this function do what it says?               | Nothing. No database, no network | `npm run test`             |
| Component   | Does this component behave, and is it accessible? | jsdom, with `fetch` stubbed      | `npm run test`             |
| Integration | Does the API work end to end?                     | A real PostgreSQL and Redis      | `npm run test:integration` |
| End-to-end  | Does the product work in a browser?               | The running API and dashboard    | `npm run test:e2e`         |

Everything except end-to-end uses [Vitest](https://vitest.dev). End-to-end uses
[Playwright](https://playwright.dev).

## Commands

```bash
npm run test                      # unit and component tests in every workspace
npm run test -w @bossbyte/api     # one workspace
npm run test:integration          # API integration tests (needs npm run docker:up)
npm run test:e2e                  # Playwright (needs the stack, migrated and seeded)
```

To work on one file, run Vitest from the workspace:

```bash
cd apps/api
npx vitest src/lib/uploads.test.ts            # watch mode
npx vitest run -t 'rejects a disguised'       # by test name

npx vitest run --config vitest.int.config.ts tests/integration/files.int.test.ts
```

## Where tests live

| Tests                   | Location                                                                         |
| ----------------------- | -------------------------------------------------------------------------------- |
| API unit tests          | Next to the code: `apps/api/src/**/*.test.ts`, plus `apps/api/tests/app.test.ts` |
| API integration tests   | `apps/api/tests/integration/*.int.test.ts`                                       |
| Dashboard tests         | Next to the code: `apps/core/src/**/*.test.{ts,tsx}`                             |
| Component library tests | Next to the code: `packages/ui/src/**/*.test.{ts,tsx}`                           |
| Shared package tests    | `packages/shared/src/schemas/schemas.test.ts` and `utils/utils.test.ts`          |
| End-to-end tests        | `e2e/*.spec.ts`                                                                  |

The `.int.test.ts` suffix is what separates the two API suites. `vitest.config.ts` excludes it
and `vitest.int.config.ts` includes only it.

## API unit tests

They need no services. `apps/api/tests/setup.ts` runs before every test file and fills in the
environment the API insists on: `NODE_ENV=test`, a freshly generated RSA key pair, and random
CSRF and encryption keys. No real secret is involved and `apps/api/.env` is not read.

Because the database and Redis clients connect lazily, importing a module that uses them is safe
as long as the test does not call into them. That is why the pure parts of the API (encryption,
upload validation, documents, valuation, token handling) are unit tested and everything that
touches a table is integration tested.

```ts
import { describe, expect, it } from 'vitest';
import { runRatioStudy } from './ratio-study';

describe('runRatioStudy', () => {
  it('reports a perfect assessment as ratio 1 with no dispersion', () => {
    const result = runRatioStudy({
      pairs: [
        { assessed: 100, sale: 100 },
        { assessed: 200, sale: 200 },
      ],
    });
    expect(result.medianRatio).toBe(1);
    expect(result.cod).toBe(0);
  });
});
```

## API integration tests

These drive the real Express app with [supertest](https://github.com/forwardemail/supertest),
against a real PostgreSQL and Redis. Nothing is mocked except object storage.

```bash
npm run docker:up
npm run test:integration
```

You do not need to migrate anything. `tests/integration/global-setup.ts` creates the
`bossbyte_test` database if it is missing and applies the same SQL migrations production uses.

### The disposable-database guard

Before **every** test, `tests/integration/setup.ts` truncates every table and flushes the Redis
database. Pointed at the wrong place, that would destroy your development data, so the suite
checks first.

`apps/api/tests/defaults.ts` holds the defaults and the guard:

```ts
export const TEST_DATABASE_URL = 'postgres://bossbyte:bossbyte@localhost:5432/bossbyte_test';
export const TEST_REDIS_URL = 'redis://localhost:6379/1';

export function assertDisposable(databaseUrl: string, redisUrl: string): void;
```

`assertDisposable` throws, before anything is touched, unless:

- the database name ends in `_test`, and
- the Redis URL names a database index other than 0 (`redis://localhost:6379` with no index
  counts as 0).

It runs in the global setup and again in every test file. The defaults satisfy it. It exists for
the day `DATABASE_URL` is exported in your shell for another reason: values in the environment
win over the defaults, which is also how CI supplies its own.

::: warning
If you point the tests elsewhere, keep to the rule: a database ending in `_test` and a non-zero
Redis index. Development uses `bossbyte` and index 0, so the two never meet.
:::

### What is reset between tests

Each test starts from the same blank slate, so tests can run in any order:

1. `TRUNCATE` of `audit_logs`, `files`, `passkeys`, `refresh_tokens` and `users`.
2. `redis.flushdb()` on the test index.
3. `resetRateLimits()`, so one test's sign-in attempts do not lock out the next.
4. A cleared in-memory object store.

Files run one at a time (`fileParallelism: false`) because they share the database.

::: tip
When you add a table, add it to the `TRUNCATE` in `tests/integration/setup.ts`.
:::

### Helpers

`tests/integration/helpers.ts` gives you what most tests need:

| Helper                       | What it does                                                                                                    |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `app`                        | The Express app, for `request(app)`                                                                             |
| `PASSWORD`                   | A password that satisfies the policy                                                                            |
| `createTestUser(overrides)`  | Inserts a user (a `viewer` unless you say otherwise) and returns it with an `authorization` header ready to use |
| `browser()`                  | A supertest agent that behaves like the dashboard: it keeps cookies and sends the CSRF token on every `post`    |
| `cookieFrom(response, name)` | The value of a cookie the response set, or `undefined`                                                          |
| `storage`                    | The in-memory object store the API is using                                                                     |

A test about something other than signing in skips the sign-in:

```ts
import request from 'supertest';
import { expect, it } from 'vitest';
import { app, createTestUser } from './helpers';

it('forbids a viewer from creating users', async () => {
  const viewer = await createTestUser();

  const { body } = await request(app)
    .post('/api/v1/users')
    .set('Authorization', viewer.authorization)
    .send({ email: 'new@example.com', name: 'New', password: 'Correct-Horse-42-Battery' })
    .expect(403);

  expect(body.error.code).toBe('forbidden');
});
```

A request with a Bearer token needs no CSRF token. A test about cookies does, so use `browser()`.
Its `post` takes a path relative to `/api/v1`:

```ts
import { SECURITY } from '@bossbyte/shared';
import { browser, cookieFrom, createTestUser, PASSWORD } from './helpers';

it('sets the refresh cookie on sign-in', async () => {
  const user = await createTestUser();
  const session = await browser();

  const response = await session.post('/auth/login', { email: user.email, password: PASSWORD });

  expect(response.status).toBe(200);
  expect(cookieFrom(response, SECURITY.cookies.refreshToken)).toBeDefined();
});
```

To check what was written, query through the pool:

```ts
import { pool } from '../../src/db/client';

const { rows } = await pool.query("SELECT metadata FROM audit_logs WHERE action = 'file.uploaded'");
```

### In-memory storage

Integration tests do not need MinIO. `helpers.ts` defines `MemoryStorage`, a `StorageDriver` that
keeps objects in a `Map`, and the setup file installs it before each test with
`setStorage(storage)`.

The upload pipeline still runs in full: the size and type checks, the content sniffing and the
image re-encoding. Only the final write goes to memory, where you can inspect it:

```ts
import { app, createTestUser, storage } from './helpers';

it('re-encodes an image and stores it', async () => {
  const staff = await createTestUser({ role: 'staff' });

  await request(app)
    .post('/api/v1/files')
    .set('Authorization', staff.authorization)
    .attach('file', await png(), 'photo.png')
    .expect(201);

  expect(storage.objects.size).toBe(1);
  const [key, object] = [...storage.objects][0]!;
  expect(key).toMatch(/\.webp$/);
  expect(object.contentType).toBe('image/webp');
});
```

Signed URLs from `MemoryStorage` look like `https://storage.test/<key>?expires=<seconds>`, which
makes the expiry easy to assert.

`setStorage` is exported from `apps/api/src/lib/storage` for exactly this. See
[File storage](/api/storage).

### Rate limits

Under `NODE_ENV=test` the rate limiters count in memory instead of in Redis, and
`resetRateLimits()` from `apps/api/src/middleware/rate-limit.ts` forgets every counter. The setup
file calls it before each test.

The limits themselves stay on, so you can test them:

```ts
import { SECURITY } from '@bossbyte/shared';

it('limits sign-in attempts', async () => {
  const session = await browser();
  const attempt = () => session.post('/auth/login', { email: 'a@example.com', password: 'wrong' });

  for (let i = 0; i < SECURITY.rateLimit.auth.limit; i += 1) await attempt();

  const response = await attempt();
  expect(response.status).toBe(429);
});
```

### Background jobs

Job handlers are plain functions, so test them by calling them. See
[Background jobs](/api/jobs#testing-a-job).

## Component tests

The component library and the dashboard both test with
[Testing Library](https://testing-library.com) in jsdom. Find elements the way a user would, by
role and label:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { Button } from './Button';

it('does not fire while loading', async () => {
  const onClick = vi.fn();
  render(
    <Button loading onClick={onClick}>
      Save
    </Button>,
  );

  await userEvent.click(screen.getByRole('button', { name: 'Save' }));

  expect(onClick).not.toHaveBeenCalled();
});
```

Each package's `vitest.setup.ts` adds the jest-dom matchers (`toBeInvalid`,
`toHaveAccessibleDescription`, …) and stubs the two things jsdom lacks that the components ask
for: `ResizeObserver` and a canvas context. In `packages/ui`, Framer Motion animations are set to
finish instantly, so a test never waits for a modal to fade.

### Accessibility checks

Both packages run [axe](https://github.com/dequelabs/axe-core) through `vitest-axe`. Import the
configured `axe` from the package's test folder (`packages/ui/src/test/axe.ts` or
`apps/core/src/test/axe.ts`), not from `vitest-axe` directly:

```tsx
import { render } from '@testing-library/react';
import { expect, it } from 'vitest';
import { axe } from '../test/axe';
import { TextField } from './TextField';

it('has no accessibility violations', async () => {
  const { container } = render(<TextField label="Email" error="Enter a valid email address" />);

  expect(await axe(container)).toHaveNoViolations();
});
```

Two rules are switched off because jsdom cannot answer them:

- `color-contrast`: jsdom does not paint, so there are no colours to measure.
- `region`: a component rendered alone has no page landmarks around it.

So a passing test means the markup is sound: names, roles, labels and ARIA relationships. It does
not mean the contrast is. Check colours in a browser.

Run the check on each state that changes the markup: with an error, open, disabled.

### Dashboard helpers

`apps/core/src/test/` has what a dashboard test needs to run without a backend.

| Helper                                 | What it does                                                          |
| -------------------------------------- | --------------------------------------------------------------------- |
| `mockFetch(routes)`                    | Replaces `fetch` for the test. A request with no route fails the test |
| `jsonResponse(body, status?)`          | A JSON response                                                       |
| `errorResponse(status, code, message)` | An error in the API's envelope                                        |
| `buildUser(overrides)`                 | A `User` as the API returns one. An admin unless you say otherwise    |
| `renderWithQuery(ui)`                  | Renders inside a fresh `QueryClient` with retries off                 |

Routes are keyed by `"METHOD /path"`. A route is a response, a function of the request, or a list
that is used up one call at a time, with the last entry repeating:

```tsx
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { authStore } from '@/lib/auth';
import { jsonResponse, mockFetch } from '@/test/fetch-mock';
import { buildUser } from '@/test/fixtures';
import { renderWithQuery } from '@/test/render';
import { LoginForm } from './LoginForm';

beforeEach(() => authStore.clear());

it('signs in and reports back', async () => {
  const server = mockFetch({
    'GET /api/v1/auth/csrf-token': jsonResponse({ csrfToken: 'csrf-1' }),
    'GET /api/v1/auth/me': jsonResponse(buildUser()),
    'POST /api/v1/auth/login': jsonResponse({
      mfaRequired: false,
      accessToken: 'token-1',
      expiresIn: 900,
    }),
  });
  const onSignedIn = vi.fn();
  renderWithQuery(<LoginForm onSignedIn={onSignedIn} />);

  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Email'), 'admin@bossbyte.local');
  await user.type(screen.getByLabelText('Password'), 'BossByte-Dev-2026');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));

  await waitFor(() => expect(onSignedIn).toHaveBeenCalledOnce());
  const [login] = server.calls('POST /api/v1/auth/login');
  expect(login?.headers.get('x-csrf-token')).toBe('csrf-1');
});
```

`server.requests` lists everything that was sent and `server.calls(key)` narrows it to one route.
Each recorded request has `method`, `url`, `headers` and the parsed `body`.

To test something that depends on who is signed in, set the user directly:

```tsx
authStore.setUser(buildUser({ role: 'viewer' }));
render(
  <RequirePermission permission="users:write">
    <button>Add user</button>
  </RequirePermission>,
);
expect(screen.queryByRole('button', { name: 'Add user' })).not.toBeInTheDocument();
```

Clear the store in `beforeEach`, as above. It is a module-level singleton and would otherwise
carry a user from one test into the next.

## End-to-end tests

Playwright drives Chromium against the real API and dashboard. The configuration is
`playwright.config.ts` at the repository root and the specs are in `e2e/`.

### First run

```bash
npx playwright install chromium   # once per machine
npm run docker:up
npm run db:migrate
npm run db:seed
npm run test:e2e
```

Playwright starts the API and the dashboard itself, and waits for
`http://localhost:4000/health` and `http://localhost:5173` before running. If you already have
`npm run dev` running, it uses those servers instead (in CI it always starts its own).

Unlike the integration tests, these use your **development** database and the seeded accounts.
They sign in and read; keep it that way, or have a spec clean up what it creates.

Useful variations:

```bash
npx playwright test --ui                  # watch and step through
npx playwright test e2e/sign-in.spec.ts   # one file
npx playwright test --headed              # see the browser
npx playwright show-report                # after a CI-style run
```

A failing test leaves a screenshot, and a trace on its first retry, in `test-results/`.

### Writing a spec

`e2e/helpers.ts` has the seeded accounts and the sign-in steps:

```ts
import { expect, test } from '@playwright/test';
import { SEED_USERS, signIn } from './helpers';

test('a viewer cannot see the Users page', async ({ page }) => {
  await signIn(page, SEED_USERS.viewer);

  await expect(page.getByRole('link', { name: 'Users' })).toBeHidden();
});
```

| Helper                                | What it does                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------- |
| `SEED_USERS`, `SEED_PASSWORD`         | The accounts `npm run db:seed` creates                                          |
| `signIn(page, email?)`                | Signs in through the form and waits for the Dashboard heading. Admin by default |
| `submitSignIn(page, email, password)` | Fills in and submits the form, for tests about sign-in itself                   |

Use the same locators as the component tests: `getByRole`, `getByLabel`, `getByText`. Avoid CSS
selectors and test ids; if a role-based locator cannot find something, a screen reader user
probably cannot either.

### Sign-in and the rate limit

Sign-in is limited to 20 attempts per 15 minutes per address, and every `signIn` call spends one.
Two things follow:

- Call `signIn` once per test, not once per step.
- The API that Playwright starts runs with `RATE_LIMIT_AUTH_MAX=1000`, so a full run cannot lock
  itself out. An API you started yourself keeps the default. If a long session of re-running
  specs starts returning 429, set `RATE_LIMIT_AUTH_MAX` in `apps/api/.env` and restart the API,
  or wait out the window.

## In CI

The `CI` workflow runs unit and component tests in the `test` job and integration tests in the
`integration` job, with PostgreSQL and Redis as service containers. End-to-end tests are a
separate workflow you start by hand. See [CI and releases](/deployment/ci).

## What to test where

- **A rule with no I/O** (a schema, a formatter, a calculation): unit test it, next to the code.
- **An endpoint**: integration test it. Cover the success, the validation failure, and each role
  that should be refused. Assert on the audit log when the action writes one.
- **A component with behaviour**: component test it, and include an axe check.
- **A journey a user must always be able to complete** (sign in, find a record, sign out): one
  end-to-end test. Keep these few; they are the slowest and the most fragile.
