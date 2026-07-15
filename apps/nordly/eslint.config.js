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
      'no-unused-vars': 'off',
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
              group: ['@pages/*', '@widgets/*'],
              message: 'shared/ must not import pages/ or widgets/',
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
              group: ['@pages/*'],
              message: 'features/ must not import pages/',
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      'src/renderer/src/pages/**/*.{ts,tsx}',
      'src/renderer/src/widgets/**/*.{ts,tsx}',
    ],
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
              ],
              message: 'pages/widgets must use a feature public api or component',
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
                '@features/calendar/lib/*',
                '@features/calendar/model/*',
                '@features/calendar/remote/*',
                '@features/calendar/repository/*',
                '@features/calendar/sync/*',
              ],
              message: 'cross-feature calendar imports must use @features/calendar/api/*',
            },
          ],
        },
      ],
    },
  },
];
