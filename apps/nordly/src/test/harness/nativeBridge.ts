import { vi } from 'vitest';

import {
  type AuthSession,
  type EventPayload,
  type NordlyAPI,
  type PomodoroSnapshot,
} from '@platform/ipc';

export interface NativeBridgeHandlers {
  authSession?: () => Promise<AuthSession | null>;
  authPersist?: (session: AuthSession) => Promise<void>;
  authLogout?: () => Promise<void>;
  pomodoroLoad?: () => Promise<PomodoroSnapshot | null>;
  pomodoroSave?: (snapshot: PomodoroSnapshot) => Promise<void>;
  openExternal?: (url: string) => Promise<void>;
  setTrafficLights?: (visible: boolean) => Promise<void>;
  deepLinkInitial?: () => Promise<string | null>;
  vaultPassLoad?: (userId: string) => Promise<string | null>;
  vaultPassSave?: (userId: string, passphrase: string) => Promise<void>;
  vaultPassClear?: (userId: string) => Promise<void>;
}

export interface MockNativeBridge {
  api: NordlyAPI;
  emit<K extends keyof EventPayload>(channel: K, payload: EventPayload[K]): void;
  restore(): void;
}

function unconfigured(name: string): never {
  throw new Error(`Unconfigured native bridge call: ${name}`);
}

/**
 * Installs an explicit window.nordly mock. Unconfigured commands fail loudly;
 * tests opt into only the native behavior they exercise.
 */
export function installMockNativeBridge(handlers: NativeBridgeHandlers = {}): MockNativeBridge {
  const original = Object.getOwnPropertyDescriptor(window, 'nordly');
  const listeners = new Map<keyof EventPayload, Set<(payload: never) => void>>();

  const api: NordlyAPI = {
    auth: {
      session: vi.fn(() => handlers.authSession?.() ?? unconfigured('auth.session')),
      persist: vi.fn((session) => handlers.authPersist?.(session) ?? unconfigured('auth.persist')),
      logout: vi.fn(() => handlers.authLogout?.() ?? unconfigured('auth.logout')),
    },
    pomodoro: {
      load: vi.fn(() => handlers.pomodoroLoad?.() ?? unconfigured('pomodoro.load')),
      save: vi.fn((snapshot) => handlers.pomodoroSave?.(snapshot) ?? unconfigured('pomodoro.save')),
    },
    shell: {
      openExternal: vi.fn((url) => handlers.openExternal?.(url) ?? unconfigured('shell.openExternal')),
    },
    window: {
      setTrafficLights: vi.fn(
        (visible) => handlers.setTrafficLights?.(visible) ?? unconfigured('window.setTrafficLights'),
      ),
    },
    deepLink: {
      initial: vi.fn(() => handlers.deepLinkInitial?.() ?? unconfigured('deepLink.initial')),
    },
    vault: {
      passLoad: vi.fn((userId) => handlers.vaultPassLoad?.(userId) ?? unconfigured('vault.passLoad')),
      passSave: vi.fn(
        (userId, passphrase) =>
          handlers.vaultPassSave?.(userId, passphrase) ?? unconfigured('vault.passSave'),
      ),
      passClear: vi.fn(
        (userId) => handlers.vaultPassClear?.(userId) ?? unconfigured('vault.passClear'),
      ),
    },
    on: (channel, listener) => {
      const channelListeners = listeners.get(channel) ?? new Set();
      channelListeners.add(listener as (payload: never) => void);
      listeners.set(channel, channelListeners);
      return () => channelListeners.delete(listener as (payload: never) => void);
    },
  };

  Object.defineProperty(window, 'nordly', { configurable: true, value: api });

  return {
    api,
    emit(channel, payload) {
      for (const listener of listeners.get(channel) ?? []) listener(payload as never);
    },
    restore() {
      if (original) Object.defineProperty(window, 'nordly', original);
      else Reflect.deleteProperty(window, 'nordly');
    },
  };
}
