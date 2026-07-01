/**
 * Tauri implementation of window.nordly.
 */
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

import {
  eventChannels,
  type AuthSession,
  type EventPayload,
  type NordlyAPI,
  type PomodoroSnapshot,
} from '@platform/ipc';

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function installNativeBridge(): void {
  if (!isTauri() || typeof window === 'undefined') return;
  if (window.nordly) return;

  const api: NordlyAPI = {
    auth: {
      session: () => invoke<AuthSession | null>('auth_session'),
      persist: (s) => invoke('auth_persist', { session: s }),
      logout: () => invoke('auth_logout'),
    },
    pomodoro: {
      load: () => invoke<PomodoroSnapshot | null>('pomodoro_load'),
      save: (s) => invoke('pomodoro_save', { snapshot: s }),
    },
    shell: {
      openExternal: (url) => invoke('shell_open_external', { url }),
    },
    window: {
      setTrafficLights: (visible) =>
        invoke('window_traffic_lights_show', { visible }),
    },
    deepLink: {
      initial: () => invoke<string | null>('deep_link_initial'),
    },
    vault: {
      passLoad: (userId) => invoke<string | null>('vault_pass_load', { userId }),
      passSave: (userId, passphrase) => invoke('vault_pass_save', { userId, passphrase }),
      passClear: (userId) => invoke('vault_pass_clear', { userId }),
    },
    on: (channel, listener) => {
      const wire = eventWire(channel);
      let unlisten: UnlistenFn | undefined;
      void listen<unknown>(wire, (ev) => {
        listener(ev.payload as EventPayload[typeof channel]);
      }).then((fn) => {
        unlisten = fn;
      });
      return () => {
        void unlisten?.();
      };
    },
  };

  window.nordly = api;
}

function eventWire<K extends keyof typeof eventChannels>(channel: K): string {
  switch (channel) {
    case 'deepLink':
      return 'app:deep-link';
    case 'authChanged':
      return 'auth:changed';
    default: {
      const _exhaustive: never = channel;
      return String(_exhaustive);
    }
  }
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}
