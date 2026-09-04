// ESLint flat config (v9) for the Nordly renderer.
import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  {
    ignores: [
      'dist/**',
      'out/**',
      'node_modules/**',
    ],
  },
  js.configs.recommended,
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'warn',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2022,
        ...globals.node,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react-hooks': reactHooks,
    },
    rules: {
      'no-undef': 'off',
      'no-redeclare': 'off',
      'no-unused-vars': 'off',
      // Canonical const-object + union types intentionally share a name.
      '@typescript-eslint/no-redeclare': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['src/renderer/src/shared/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@app/*', '@features/*', '@pages/*', '@widgets/*'],
              message: 'shared/ must not import features or composition layers',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/renderer/src/features/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@app/*', '@pages/*', '@widgets/*'],
              message: 'features/ must not import composition layers',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/renderer/src/pages/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@pages/*'],
              message: 'pages must not import another page; use features/',
            },
            {
              group: [
                '@features/*/repository/*',
                '@features/*/remote/*',
                '@features/*/sync/*',
                '@features/*/vault',
                '@features/*/vault/*',
                '@features/calendar/lib/googleCalendarSyncWorker',
                '@features/calendar/lib/googleCalendarCache',
                '@features/calendar/lib/googleCalendarConnectionStore',
                '@features/calendar/lib/appleCalendarEventsStore',
              ],
              message: 'pages must use a feature public api or component',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/renderer/src/widgets/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@features/*/repository/*',
                '@features/*/remote/*',
                '@features/*/sync/*',
                '@features/*/vault',
                '@features/*/vault/*',
                '@features/calendar/lib/googleCalendarSyncWorker',
                '@features/calendar/lib/googleCalendarCache',
                '@features/calendar/lib/googleCalendarConnectionStore',
                '@features/calendar/lib/appleCalendarEventsStore',
              ],
              message: 'widgets must use a feature public api or component',
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      'src/renderer/src/features/tasks/**/*.{ts,tsx}',
      'src/renderer/src/features/planning/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@app/*',
                '@pages/*',
                '@widgets/*',
                '@features/calendar/remote/*',
                '@features/calendar/repository/*',
                '@features/calendar/sync/*',
              ],
              message:
                'task/planning features must avoid composition layers and calendar internals',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/renderer/src/features/*/sync/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@app/*',
                '@pages/*',
                '@widgets/*',
                '@features/*/hooks/*',
                '@features/calendar/remote/*',
                '@features/calendar/repository/*',
                '@features/calendar/sync/*',
              ],
              message: 'feature sync must depend on APIs, repositories, remotes, and models only',
            },
          ],
        },
      ],
    },
  },
];
