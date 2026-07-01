// Centralized localStorage keys for Hone desktop.

export const STORAGE_KEYS = {
  /** Device id for X-Device-ID header (see api/device.ts). */
  deviceId: 'nordly:device-id',
  /** Settings JSON blob (pomodoro / dailyGoal / volume / notifications). */
  settings: 'nordly:settings',
  /** Theme id ('winter' | 'drift' | 'visor' | 'debris' | 'launch' | 'birthday-light' | 'particles'). */
  theme: 'nordly:theme',
  /** UI locale ('en' | 'ru'). */
  locale: 'nordly:locale',
} as const;
