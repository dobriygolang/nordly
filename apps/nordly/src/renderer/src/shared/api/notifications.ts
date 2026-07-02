// notifications.ts — Nordly toast banner (Tauri overlay window).
//
// Desktop: `show_notification` opens a small always-on-top window styled like
// a macOS banner in Nordly theme colors (surface, ink, blur).
// Browser dev uses the Web Notification API directly.

import { invoke } from '@tauri-apps/api/core';

import { readSettings } from '@shared/model/settings';
import {
  playCalendarReminderSound,
  playSessionCompleteSound,
} from '@shared/lib/sessionCompleteSound';
import { isTauriRuntime } from '@platform/runtime';

/** Auto-dismiss when the user does not close the banner manually. */
export const NOTIFY_AUTO_DISMISS_MS = 60_000;

let permissionPromise: Promise<NotificationPermission> | null = null;

async function ensureWebPermission(): Promise<NotificationPermission> {
  if (typeof Notification === 'undefined') return 'denied';
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission;
  }
  if (!permissionPromise) {
    permissionPromise = Notification.requestPermission();
  }
  return permissionPromise;
}

async function notifyWeb(title: string, body?: string): Promise<void> {
  if (typeof Notification === 'undefined') return;
  const perm = await ensureWebPermission();
  if (perm !== 'granted') throw new Error(`Notification permission is ${perm}`);
  const notification = new Notification(title, { body, silent: false });
  window.setTimeout(() => notification.close(), NOTIFY_AUTO_DISMISS_MS);
}

export interface NotifyOptions {
  /** Play a built-in chime. */
  sound?: boolean | 'session' | 'calendar';
}

/**
 * notify — themed system banner on desktop; Web Notification in browser dev.
 */
export async function notify(title: string, body?: string, options?: NotifyOptions): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!readSettings().notifications) return;

  if (options?.sound === 'calendar') {
    void playCalendarReminderSound();
  } else if (options?.sound) {
    void playSessionCompleteSound();
  }

  if (isTauriRuntime()) {
    await invoke('show_notification', { title, body: body ?? '' });
    return;
  }

  await notifyWeb(title, body);
}
