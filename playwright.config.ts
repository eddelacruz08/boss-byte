import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env.CI);

/**
 * End-to-end tests drive the real dashboard against the real API, so the
 * backing services must be up and the database seeded first:
 *
 *   npm run docker:up && npm run db:migrate && npm run db:seed
 *   npm run test:e2e
 *
 * Playwright starts the API and the dashboard itself, or reuses the ones
 * `npm run dev` already has running. The API it starts gets a generous sign-in
 * rate limit; one you started yourself keeps the default of 20 attempts per
 * 15 minutes, unless RATE_LIMIT_AUTH_MAX in apps/api/.env says otherwise.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm run dev -w @bossbyte/api',
      url: 'http://localhost:4000/health',
      env: { RATE_LIMIT_AUTH_MAX: '1000' },
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
    {
      command: 'npm run dev -w @bossbyte/core',
      url: 'http://localhost:5173',
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
  ],
});
