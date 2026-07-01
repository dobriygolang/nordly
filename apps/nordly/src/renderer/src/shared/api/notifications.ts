// notifications.ts — Nordly toast banner (Tauri overlay window) + Web fallback.
//
// Desktop: `show_notification` opens a small always-on-top window styled like
// a macOS banner in Nordly theme colors (surface, ink, blur).
// Browser dev: falls back to the Web Notification API.

import { invoke } from '@tauri-apps/api/core';

import { playSessionCompleteSound } from '@shared/lib/sessionCompleteSound';
import { STORAGE_KEYS } from '@shared/lib/storage-keys';

const SETTINGS_KEY: string = STORAGE_KEYS.settings;

interface StoredSettings {
  notifications?: boolean;
}

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function isNotificationsEnabled(): boolean {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return true;
    const parsed = JSON.parse(raw) as StoredSettings;
    return typeof parsed.notifications === 'boolean' ? parsed.notifications : true;
  } catch {
    return true;
  }
}

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
  try {
    const perm = await ensureWebPermission();
    if (perm !== 'granted') return;
    new Notification(title, { body, silent: false });
  } catch {
    /* degraded UX */
  }
}

export interface NotifyOptions {
  /** Play the built-in session-complete chime. */
  sound?: boolean;
}

/**
 * notify — themed system banner on desktop; Web Notification in browser dev.
 */
export async function notify(title: string, body?: string, options?: NotifyOptions): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!isNotificationsEnabled()) return;

  if (options?.sound) void playSessionCompleteSound();

  if (isTauri()) {
    try {
      await invoke('show_notification', { title, body: body ?? '' });
      return;
    } catch {
      /* fall through to web API */
    }
  }

  await notifyWeb(title, body);
}
