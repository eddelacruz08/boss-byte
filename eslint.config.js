import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import { reactRefresh } from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const reactFiles = ['apps/core/**/*.{ts,tsx}', 'packages/ui/**/*.{ts,tsx}'];

export default defineConfig(
  globalIgnores([
    '**/node_modules/**',
    '**/dist/**',
    '**/coverage/**',
    '**/.turbo/**',
    '**/routeTree.gen.ts',
    'apps/docs/.vitepress/cache/**',
    'apps/docs/.vitepress/dist/**',
    'playwright-report/**',
    'test-results/**',
  ]),

  js.configs.recommended,
  tseslint.configs.recommended,

  {
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  // Node: the API, tooling scripts and config files.
  {
    files: [
      'apps/api/**/*.ts',
      'scripts/**/*.mjs',
      'e2e/**/*.ts',
      '**/*.config.{js,cjs,mjs,ts,mts}',
      'apps/docs/.vitepress/**/*.{ts,mts}',
    ],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: ['scripts/**/*.mjs', 'apps/api/src/db/{migrate,seed,rotate-keys}.ts'],
    rules: { 'no-console': 'off' },
  },

  // Browser: the dashboard and the component library.
  {
    files: reactFiles,
    extends: [reactHooks.configs.flat['recommended-latest'], reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
  },
  {
    // Route files export a `Route` object next to their components by design.
    files: ['apps/core/src/routes/**/*.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },

  prettier,
);
