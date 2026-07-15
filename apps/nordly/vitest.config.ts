import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

const LAYERS = {
  '@app': resolve(__dirname, 'src/renderer/src/app'),
  '@pages': resolve(__dirname, 'src/renderer/src/pages'),
  '@widgets': resolve(__dirname, 'src/renderer/src/widgets'),
  '@features': resolve(__dirname, 'src/renderer/src/features'),
  '@shared': resolve(__dirname, 'src/renderer/src/shared'),
  '@platform': resolve(__dirname, 'src/renderer/src/platform'),
  '@nordly-i18n': resolve(__dirname, '../shared/i18n'),
};

export default defineConfig({
  resolve: {
    // apps/shared/i18n lives outside this package; pin React so Vite does not
    // look for node_modules next to apps/shared/.
    alias: {
      ...LAYERS,
      react: resolve(__dirname, 'node_modules/react'),
      'react/jsx-runtime': resolve(__dirname, 'node_modules/react/jsx-runtime'),
      'react-dom': resolve(__dirname, 'node_modules/react-dom'),
    },
    dedupe: ['react', 'react-dom'],
  },
  test: {
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    pool: 'threads',
    testTimeout: 10_000,
    hookTimeout: 10_000,
    coverage: {
      reporter: ['text'],
      include: [
        'src/renderer/src/shared/sync/**/*.{ts,tsx}',
        'src/renderer/src/shared/crypto/**/*.{ts,tsx}',
        'src/renderer/src/features/*/api/**/*.{ts,tsx}',
        'src/renderer/src/features/*/sync/**/*.{ts,tsx}',
      ],
      exclude: ['**/__tests__/**', '**/*.{test,spec}.{ts,tsx}'],
      thresholds: {
        statements: 15,
        branches: 65,
        functions: 30,
        lines: 15,
      },
    },
  },
});
