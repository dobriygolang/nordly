import { useEffect } from 'react';

import {
  defaultQuickCaptureShortcut,
  readSettings,
} from '@shared/model/settings';

import { applyQuickCaptureConfig } from '../lib/quickCaptureBridge';

/** Register the OS-level quick-capture shortcut once at app startup. */
export function useQuickCaptureShortcutRegistration(
  onRegistrationError?: (message: string) => void,
): void {
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const settings = readSettings();
      const result = await applyQuickCaptureConfig(settings);
      if (cancelled || result.ok || !result.error) return;
      onRegistrationError?.(result.error);
    })();

    return () => {
      cancelled = true;
    };
  }, [onRegistrationError]);
}

export function readQuickCaptureSettings() {
  const settings = readSettings();
  return {
    enabled: settings.quickCaptureEnabled,
    shortcut: settings.quickCaptureShortcut.trim() || defaultQuickCaptureShortcut(),
  };
}
