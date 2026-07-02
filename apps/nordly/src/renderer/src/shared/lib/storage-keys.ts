// Centralized localStorage keys for Nordly desktop.

export const STORAGE_KEYS = {
  /** Device id for X-Device-ID header (see api/device.ts). */
  deviceId: 'nordly:device-id',
  /** Settings JSON blob (pomodoro / dailyGoal / notifications / calendar reminders). */
  settings: 'nordly:settings',
  /** Theme id ('winter' | 'drift' | 'visor' | 'debris' | 'launch' | 'birthday-light' | 'particles'). */
  theme: 'nordly:theme',
} as const;
