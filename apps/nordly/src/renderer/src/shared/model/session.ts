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
import { useFeatureUsageStore } from '@shared/model/featureUsage';
import { useSyncStore } from '@shared/model/sync';

type AuthStatus = 'unknown' | 'guest' | 'signed_in';

// Browser-mode session persistence. In Electron production the session lives in
// safeStorage keychain (main-process IPC). In Vite browser-mode the IPC bridge
// is nil — persist to localStorage so Telegram login survives page reload.
const BROWSER_PERSIST_KEY = 'nordly:dev-session:v1';

const USER_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isPersistedUserId(userId: string): boolean {
  return USER_ID_RE.test(userId);
}

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
  clear: (opts?: { skipNativeLogout?: boolean }) => Promise<void>;

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
    const applySession = (s: PersistedSession): boolean => {
      if (!isPersistedUserId(s.userId)) {
        clearBrowserPersist();
        setDbUserId(null);
        set({ status: 'guest', userId: null, accessToken: null, refreshToken: null, expiresAt: 0 });
        return false;
      }
      setDbUserId(s.userId);
      set({
        status: 'signed_in',
        userId: s.userId,
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        expiresAt: s.expiresAt,
      });
      writeBrowserPersist(s);
      return true;
    };

    const bridge = window.nordly;
    if (!bridge) {
      const persisted = readBrowserPersist();
      if (persisted && applySession(persisted)) return;
      setDbUserId(null);
      set({ status: 'guest' });
      return;
    }

    let native: Awaited<ReturnType<typeof bridge.auth.session>> | null = null;
    try {
      native = await withTimeout(bridge.auth.session(), BOOTSTRAP_IPC_TIMEOUT_MS);
    } catch {
      native = null;
    }

    if (native?.userId && (native.accessToken || native.refreshToken)) {
      if (typeof native.expiresAt !== 'number') throw new Error('Invalid native session: missing expiresAt');
      applySession({
        userId: native.userId,
        accessToken: native.accessToken,
        refreshToken: native.refreshToken ?? null,
        expiresAt: native.expiresAt,
      });
      return;
    }

    try {
      const persisted = readBrowserPersist();
      if (persisted && applySession(persisted)) {
        void persistSessionToNative(persisted);
        return;
      }
    } catch {
      clearBrowserPersist();
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
    setDbUserId(userId);
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

  clear: async (opts) => {
    clearBrowserPersist();
    setDbUserId(null);
    lockVault();
    clearVaultPrefsCache();
    useSyncStore.getState().setSessionReauthRequired(false);
    useSyncStore.getState().setCloudSyncBlocked(false);
    useFeatureUsageStore.getState().setDeviceRegistration(null);
    set({ status: 'guest', userId: null, accessToken: null, refreshToken: null, expiresAt: 0 });
    try {
      const { resetAuthRefreshState } = await import('@shared/api/authSession');
      resetAuthRefreshState();
    } catch {
      /* authSession may be unavailable in tests */
    }
    try {
      const bridge = window.nordly;
      if (bridge && !opts?.skipNativeLogout) {
        await bridge.auth.logout();
      }
    } catch (err) {
      console.error('[nordly:session] native logout failed', err);
    }
    void import('@shared/api/registerSyncDevice').then(({ resetDeviceRegisterCache }) => {
      resetDeviceRegisterCache();
    });
  },
}));
