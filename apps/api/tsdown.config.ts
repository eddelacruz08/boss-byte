import { defineConfig } from 'tsdown';

/**
 * Bundles the API for production. Each entry becomes dist/<name>.js:
 *
 *   node dist/server.js        the HTTP API
 *   node dist/worker.js        the background worker
 *   node dist/migrate.js       apply pending migrations
 *   node dist/seed.js          create the demo accounts
 *   node dist/rotate-keys.js   re-encrypt data after a key rotation
 */
export default defineConfig({
  entry: {
    server: 'src/server.ts',
    worker: 'src/worker.ts',
    migrate: 'src/db/migrate.ts',
    seed: 'src/db/seed.ts',
    'rotate-keys': 'src/db/rotate-keys.ts',
  },
  format: 'esm',
  platform: 'node',
  target: 'node26',
  outDir: 'dist',
  // Plain .js: the package is already "type": "module", and the Dockerfile,
  // PM2 config and npm scripts all start dist/<name>.js.
  fixedExtension: false,
  clean: true,
  sourcemap: true,
  dts: false,
  // npm dependencies stay external and are installed in the image. The shared
  // workspace package ships TypeScript source, so it has to be compiled in.
  deps: { alwaysBundle: ['@bossbyte/shared'] },
});
