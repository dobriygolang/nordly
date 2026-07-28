// Centralized localStorage keys for Nordly desktop.

export const STORAGE_KEYS = {
  /** Device id for X-Device-ID header (see api/device.ts). */
  deviceId: 'nordly:device-id',
  /**
   * Stable local profile UUID for offline-first boot (no Telegram / keychain).
   * After first cloud login + rebind this becomes the cloud userId so sign-out
   * keeps the same IndexedDB scope.
   */
  localProfileUserId: 'nordly:local-profile-user-id',
  /** User dismissed the soft “sign in to sync” banner for a local profile. */
  localAuthBannerDismissed: 'nordly:local-auth-banner-dismissed',
  /** Settings JSON blob (pomodoro / dailyGoal / notifications / calendar reminders). */
  settings: 'nordly:settings',
  /** Theme id ('winter' | 'drift' | 'visor' | 'debris' | 'launch' | 'birthday-light' | 'particles'). */
  theme: 'nordly:theme',
  /** Last background update check + notified version. */
  updateCheck: 'nordly:update-check',
} as const;
