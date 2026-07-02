// session.ts — auth store с keychain-bootstrap'ом.
//
// Поведение на mount: hydrate() читает session из main-process через
// IPC bridge (window.nordly.auth.session), main-process в свою очередь
// расшифровывает файл safeStorage'ом. На login deep-link — main-process
// шлёт authChanged event, мы persist'им в keychain и ставим в store.
//
// Pre-mount → state = { status: 'unknown' } чтобы UI не флипал между
// «not signed in» и «signed in» во время restore.
import { create } from 'zustand';

import { setDbUserId } from '@shared/db/nordlyDb';
import { lockVault } from '@shared/crypto/vault';
import { clearVaultPrefsCache } from '@shared/crypto/vaultPrefs';

type AuthStatus = 'unknown' | 'guest' | 'signed_in';

// Browser-mode dev persistence. В Electron production session
// идёт через safeStorage keychain (main-process IPC). В Vite browser-mode
// IPC bridge nil → reload terять токен. Persist в localStorage чтобы
// dev-flow (LoginScreen DEV LOGIN button) survived page reload.
//
// Production safe: ключи под BROWSER_PERSIST_KEY namespace; Electron
// instance bridge'ом приходит сильнее (main-keychain) и localStorage
// шумом не используется.
const BROWSER_PERSIST_KEY = 'nordly:dev-session:v1';

interface PersistedSession {
  userId: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
}

function readBrowserPersist(): PersistedSession | null {
  const raw = window.localStorage.getItem(BROWSER_PERSIST_KEY);
  if (!raw) return null;
  const s = JSON.parse(raw) as Partial<PersistedSession>;
  if (!s.userId) throw new Error('Invalid browser session: missing userId');
  if (!s.accessToken && !s.refreshToken) throw new Error('Invalid browser session: missing tokens');
  if (typeof s.expiresAt !== 'number') throw new Error('Invalid browser session: missing expiresAt');
  return {
    userId: s.userId,
    accessToken: s.accessToken ?? '',
    refreshToken: s.refreshToken ?? null,
    expiresAt: s.expiresAt,
  };
}

async function persistSessionToNative(session: PersistedSession): Promise<void> {
  const bridge = window.nordly;
  if (!bridge) return;
  await bridge.auth.persist({
    userId: session.userId,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken ?? '',
    expiresAt: session.expiresAt,
  });
}

function writeBrowserPersist(s: PersistedSession): void {
  window.localStorage.setItem(BROWSER_PERSIST_KEY, JSON.stringify(s));
}

function clearBrowserPersist(): void {
  window.localStorage.removeItem(BROWSER_PERSIST_KEY);
}

interface SessionState {
  status: AuthStatus;
  userId: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number;

  /** Bootstrap on app mount — reads from keychain via preload. */
  bootstrap: () => Promise<void>;

  /** Called by deep-link handler / login modal after token arrives. */
  hydrate: (s: {
    userId: string;
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
  }) => void;

  /** Clears in-memory + keychain. Used by logout. */
  clear: () => Promise<void>;

  /** Updates tokens after refresh — persists to browser + keychain. */
  applyTokens: (s: PersistedSession) => void;
}

const BOOTSTRAP_IPC_TIMEOUT_MS = 4_000;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('bootstrap timeout')), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export const useSessionStore = create<SessionState>((set) => ({

  status: 'unknown',
  userId: null,
  accessToken: null,
  refreshToken: null,
  expiresAt: 0,

  bootstrap: async () => {
    const bridge = window.nordly;
    if (!bridge) {
      const persisted = readBrowserPersist();
      if (persisted) {
        setDbUserId(persisted.userId);
        set({
          status: 'signed_in',
          userId: persisted.userId,
          accessToken: persisted.accessToken,
          refreshToken: persisted.refreshToken,
          expiresAt: persisted.expiresAt,
        });
        return;
      }
      const devToken = import.meta.env.VITE_NORDLY_DEV_TOKEN?.trim();
      if (devToken) {
        setDbUserId('dev-preview-user');
        set({
          status: 'signed_in',
          userId: 'dev-preview-user',
          accessToken: devToken,
          refreshToken: null,
          expiresAt: 0,
        });
        return;
      }
      setDbUserId(null);
      set({ status: 'guest' });
      return;
    }
    const s = await withTimeout(bridge.auth.session(), BOOTSTRAP_IPC_TIMEOUT_MS);
    if (s && s.userId && (s.accessToken || s.refreshToken)) {
      if (typeof s.expiresAt !== 'number') throw new Error('Invalid native session: missing expiresAt');
      setDbUserId(s.userId);
      set({
        status: 'signed_in',
        userId: s.userId,
        accessToken: s.accessToken,
        refreshToken: s.refreshToken ?? null,
        expiresAt: s.expiresAt,
      });
      return;
    }
    setDbUserId(null);
    set({ status: 'guest' });
  },

  hydrate: ({ userId, accessToken, refreshToken, expiresAt }) => {
    const session: PersistedSession = {
      userId,
      accessToken,
      refreshToken: refreshToken ?? null,
      expiresAt: expiresAt ?? 0,
    };
    setDbUserId(userId);
    set({
      status: 'signed_in',
      userId,
      accessToken,
      refreshToken: refreshToken ?? null,
      expiresAt: expiresAt ?? 0,
    });
    writeBrowserPersist(session);
    void persistSessionToNative(session);
  },

  applyTokens: ({ userId, accessToken, refreshToken, expiresAt }) => {
    const session: PersistedSession = {
      userId,
      accessToken,
      refreshToken,
      expiresAt,
    };
    set({ accessToken, refreshToken, expiresAt });
    writeBrowserPersist(session);
    void persistSessionToNative(session);
  },

  clear: async () => {
    clearBrowserPersist();
    const bridge = window.nordly;
    if (bridge) {
      await bridge.auth.logout();
    }
    setDbUserId(null);
    lockVault();
    clearVaultPrefsCache();
    set({ status: 'guest', userId: null, accessToken: null, refreshToken: null, expiresAt: 0 });
  },
}));
