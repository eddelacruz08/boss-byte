import { defineConfig } from 'vitest/config';

/**
 * Integration tests: the real HTTP stack against a real PostgreSQL and Redis
 * (`npm run docker:up`), in a database and a Redis index of their own.
 *
 *   npm run test:integration
 *
 * Files run one at a time because they share that database, and every test
 * starts by emptying it — see tests/integration/setup.ts.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.int.test.ts'],
    globalSetup: ['tests/integration/global-setup.ts'],
    setupFiles: ['tests/setup.ts', 'tests/integration/setup.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
