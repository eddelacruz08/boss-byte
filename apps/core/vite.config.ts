import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, 'VITE_');
  const apiProxy = {
    '/api': { target: env.VITE_API_PROXY_TARGET ?? 'http://localhost:4000' },
  };

  return {
    plugins: [
      // Has to run before the React plugin: it generates src/routeTree.gen.ts
      // and splits every route's component into its own chunk.
      tanstackRouter({ target: 'react', autoCodeSplitting: true }),
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: { port: 5173, strictPort: true, proxy: apiProxy },
    preview: { port: 5173, strictPort: true, proxy: apiProxy },
    // The largest chunk is exceljs (~930 kB), loaded only when someone exports
    // a spreadsheet. The limit sits just above it so a new oversized chunk
    // still gets flagged.
    build: { chunkSizeWarningLimit: 1000 },
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
  };
});
