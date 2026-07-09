import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'node:path';

const LAYERS = {
  '@app': resolve(__dirname, 'src/renderer/src/app'),
  '@pages': resolve(__dirname, 'src/renderer/src/pages'),
  '@widgets': resolve(__dirname, 'src/renderer/src/widgets'),
  '@features': resolve(__dirname, 'src/renderer/src/features'),
  '@shared': resolve(__dirname, 'src/renderer/src/shared'),
  '@platform': resolve(__dirname, 'src/renderer/src/platform'),
};
const SHARED_ALIASES = {
  '@nordly-i18n': resolve(__dirname, '../shared/i18n'),
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, resolve(__dirname), '');
  const useLocal =
    env.VITE_NORDLY_LOCAL_API === 'true' ||
    env.VITE_NORDLY_LOCAL_API === '1';
  const prodApi = (env.VITE_NORDLY_API_BASE || 'https://trynordly.app').replace(/\/$/, '');

  const proxy = useLocal
    ? {
        '/healthz': { target: 'http://localhost:8080', changeOrigin: true },
        '/v1/auth': { target: 'http://localhost:8080', changeOrigin: true },
        '/v1/jwt': { target: 'http://localhost:8080', changeOrigin: true },
        '/v1/tracker': { target: 'http://localhost:8089', changeOrigin: true },
        '/v1/notes': { target: 'http://localhost:8090', changeOrigin: true },
        '/v1/focus': { target: 'http://localhost:8091', changeOrigin: true },
        '/v1/rooms': { target: 'http://localhost:8087', changeOrigin: true },
        '/v1/billing': { target: 'http://localhost:8085', changeOrigin: true },
        '/v1/devices': { target: 'http://localhost:8080', changeOrigin: true },
      }
    : {
        '/healthz': { target: prodApi, changeOrigin: true },
        '/v1/auth': { target: prodApi, changeOrigin: true },
        '/v1/jwt': { target: prodApi, changeOrigin: true },
        '/v1/tracker': { target: prodApi, changeOrigin: true },
        '/v1/notes': { target: prodApi, changeOrigin: true },
        '/v1/focus': { target: prodApi, changeOrigin: true },
        '/v1/rooms': { target: prodApi, changeOrigin: true },
        '/v1/billing': { target: prodApi, changeOrigin: true },
        '/v1/devices': { target: prodApi, changeOrigin: true },
      };

  return {
    root: resolve(__dirname, 'src/renderer'),
    publicDir: resolve(__dirname, 'src/renderer/public'),
    envDir: resolve(__dirname),
    plugins: [react()],
    clearScreen: false,
    optimizeDeps: {
      include: ['zustand', 'zustand/react', '@excalidraw/excalidraw'],
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy,
    },
    build: {
      outDir: resolve(__dirname, 'dist'),
      emptyOutDir: true,
      target: 'esnext',
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'src/renderer/index.html'),
        },
      },
    },
    resolve: {
      alias: {
        ...LAYERS,
        ...SHARED_ALIASES,
      },
    },
  };
});
