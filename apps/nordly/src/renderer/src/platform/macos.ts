import { isTauriRuntime } from '@platform/runtime';

/** True when running the Nordly desktop app on macOS. */
export function isMacOsDesktop(): boolean {
  if (!isTauriRuntime() || typeof navigator === 'undefined') return false;
  return /Mac/i.test(navigator.userAgent);
}
