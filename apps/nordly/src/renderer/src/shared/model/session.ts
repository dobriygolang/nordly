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

// Browser-dev session persistence only. Native sessions live exclusively in the
// OS keychain; a missing bridge in a production build must never persist tokens.
const BROWSER_PERSIST_KEY = 'nordly:dev-session:v1';

/** Bumped on sign-out so in-flight native persist cannot restore keychain session. */
let sessionPersistEpoch = 0;

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
  if (window.nordly || !import.meta.env.DEV) return null;
  const raw = window.localStorage.getItem(BROWSER_PERSIST_KEY);
  if (!raw) return null;
  const s = JSON.parse(raw) as Partial<PersistedSession>;
  if (!s.userId) throw new Error('Invalid browser session: missing userId');
  if (typeof s.accessToken !== 'string' || !s.accessToken) {
    throw new Error('Invalid browser session: missing accessToken');
  }
  if (typeof s.expiresAt !== 'number') throw new Error('Invalid browser session: missing expiresAt');
  return {
    userId: s.userId,
    accessToken: s.accessToken,
    refreshToken: typeof s.refreshToken === 'string' ? s.refreshToken : null,
    expiresAt: s.expiresAt,
  };
}

async function persistSessionToNative(session: PersistedSession, epoch: number): Promise<void> {
  const bridge = window.nordly;
  if (!bridge) return;
  // Native AuthSession.refreshToken is a required string; empty means "no refresh token".
  await bridge.auth.persist({
    userId: session.userId,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken ?? '',
    expiresAt: session.expiresAt,
  });
  if (epoch !== sessionPersistEpoch) {
    try {
      await bridge.auth.logout();
    } catch {
      /* best-effort: undo stale keychain write after sign-out */
    }
  }
}

function persistSessionInBackground(session: PersistedSession): void {
  void persistSessionToNative(session, sessionPersistEpoch).catch((err: unknown) => {
    console.error('[nordly:session] native session persistence failed', err);
  });
}

function writeBrowserPersist(s: PersistedSession): void {
  if (window.nordly || !import.meta.env.DEV) {
    clearBrowserPersist();
    return;
  }
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
    expiresAt: number;
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

export const useSessionStore = create<SessionState>((set, get) => ({

  status: 'unknown',
  userId: null,
  accessToken: null,
  refreshToken: null,
  expiresAt: 0,

  bootstrap: async () => {
    const applySession = (s: PersistedSession): boolean => {
      if (!isPersistedUserId(s.userId)) {
        if (get().userId !== null) {
          lockVault();
          clearVaultPrefsCache();
        }
        clearBrowserPersist();
        setDbUserId(null);
        set({ status: 'guest', userId: null, accessToken: null, refreshToken: null, expiresAt: 0 });
        return false;
      }
      if (get().userId !== s.userId) {
        lockVault();
        clearVaultPrefsCache();
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
      // Expired access JWT is fine for local-first use. Demand interactive reauth
      // only when there is no refresh token to recover with once online.
      if (s.expiresAt > 0 && Date.now() > s.expiresAt && !s.refreshToken) {
        useSyncStore.getState().setSessionReauthRequired(true);
      }
      return true;
    };

    const bridge = window.nordly;
    if (!bridge) {
      if (!import.meta.env.DEV) {
        clearBrowserPersist();
        throw new Error('Native auth bridge unavailable outside browser development');
      }
      const persisted = readBrowserPersist();
      if (persisted && applySession(persisted)) return;
      if (get().userId !== null) {
        lockVault();
        clearVaultPrefsCache();
      }
      setDbUserId(null);
      set({ status: 'guest', userId: null, accessToken: null, refreshToken: null, expiresAt: 0 });
      return;
    }

    clearBrowserPersist();
    let native: Awaited<ReturnType<typeof bridge.auth.session>> | null = null;
    try {
      native = await withTimeout(bridge.auth.session(), BOOTSTRAP_IPC_TIMEOUT_MS);
    } catch (err) {
      console.error('[nordly:session] native session bootstrap failed', err);
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

    if (get().userId !== null) {
      lockVault();
      clearVaultPrefsCache();
    }
    setDbUserId(null);
    set({ status: 'guest', userId: null, accessToken: null, refreshToken: null, expiresAt: 0 });
  },

  hydrate: ({ userId, accessToken, refreshToken, expiresAt }) => {
    if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) {
      throw new Error('Invalid session hydrate: missing expiresAt');
    }
    const session: PersistedSession = {
      userId,
      accessToken,
      refreshToken: refreshToken ?? null,
      expiresAt,
    };
    if (get().userId !== userId) {
      lockVault();
      clearVaultPrefsCache();
    }
    setDbUserId(userId);
    set({
      status: 'signed_in',
      userId,
      accessToken,
      refreshToken: refreshToken ?? null,
      expiresAt,
    });
    writeBrowserPersist(session);
    persistSessionInBackground(session);
  },

  applyTokens: ({ userId, accessToken, refreshToken, expiresAt }) => {
    const currentUserId = get().userId;
    if (currentUserId !== userId) {
      lockVault();
      clearVaultPrefsCache();
      throw new Error('Cannot apply tokens for a different session user');
    }
    setDbUserId(userId);
    const session: PersistedSession = {
      userId,
      accessToken,
      refreshToken,
      expiresAt,
    };
    set({ accessToken, refreshToken, expiresAt });
    writeBrowserPersist(session);
    persistSessionInBackground(session);
  },

  clear: async (opts) => {
    sessionPersistEpoch += 1;
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
