import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

// Covers subpaths such as @electric-sql/pglite/live, which `paths` would miss.
const PGLITE = {
  regex: '^@electric-sql/pglite(/|$)',
  message: 'PGlite belongs to the web app; in a phone app bundle it adds megabytes of WASM.',
};

export default tseslint.config(
  { ignores: ['dist', 'node_modules', '.venv'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    files: ['packages/birding-core/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            PGLITE,
            {
              // Core files sit at most one folder below src/, so two steps up leaves the package.
              regex: '^(\\./)?(\\.\\./){2,}',
              message: 'The birding core must not import from an app. Move the code into the core, or pass it in.',
            },
            {
              group: ['@birdspotter/*', '!@birdspotter/birding-core'],
              message: 'The birding core must not import from an app.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            PGLITE,
            {
              regex: '/src/db(/|$)',
              message: "A phone app must not import the web app's database; it would pull PGlite into its bundle.",
            },
          ],
        },
      ],
    },
  },
  {
    // Replaces the apps rule above for these files, so it repeats PGLITE.
    files: ['apps/lets-go-birding/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            PGLITE,
            {
              // App files sit at most one folder below src/, so two steps up leaves the app.
              regex: '^(\\./)?(\\.\\./){2,}',
              message: "Let's Go Birding imports only the birding core, never the web app or CBC Scout.",
            },
            {
              group: ['@birdspotter/*', '!@birdspotter/birding-core'],
              message: "Let's Go Birding imports only the birding core, never the web app or CBC Scout.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/apps/**', '@birdspotter/*', '!@birdspotter/birding-core'],
              message: 'Apps import from the web app, never the reverse.',
            },
          ],
        },
      ],
    },
  },
);
