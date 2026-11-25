import { configDefaults, defineConfig } from 'vitest/config';

/**
 * Unit tests: fast, and with no services required. They cover pure logic and
 * drive the HTTP layer with Supertest up to the point where a database would
 * be needed. Anything beyond that belongs in a `*.int.test.ts` file — see
 * vitest.int.config.ts.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: [...configDefaults.exclude, '**/*.int.test.ts'],
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/server.ts',
        'src/worker.ts',
        'src/db/{migrate,seed,rotate-keys}.ts',
      ],
    },
  },
});
