/// <reference types="vite/client" />

import type { NordlyAPI } from '@platform/ipc';

declare global {
  interface Window {
    nordly: NordlyAPI;
    __nordlySession?: unknown;
  }
}

declare module 'react' {
  interface CSSProperties {
    WebkitAppRegion?: 'drag' | 'no-drag';
  }
}

export {};
