import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    // Node's own `localStorage` global is unusable without a backing file and
    // shadows jsdom's. Turning it off lets tests see the jsdom one.
    execArgv: ['--no-experimental-webstorage'],
  },
});
