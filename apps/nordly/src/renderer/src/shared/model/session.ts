// session.ts — auth store с keychain-bootstrap'ом + offline local profile.
//
// Boot: keychain cloud session if present, otherwise ensureLocalProfile() so the
// shell opens without Telegram / identity. Pre-mount status='unknown' avoids flicker.
import { create } from 'zustand';

import { setDbUserId } from '@shared/db/nordlyDb';
import { lockVault } from '@shared/crypto/vault';
import { clearVaultPrefsCache } from '@shared/crypto/vaultPrefs';
import { STORAGE_KEYS } from '@shared/lib/storage-keys';
import { useDeviceRegistrationStore } from '@shared/model/deviceRegistration';
import { useSyncStore } from '@shared/model/sync';
import { resetUserScope } from '@shared/model/userScopeLifecycle';

export const AuthStatus = {
  Unknown: 'unknown',
  Guest: 'guest',
  SignedIn: 'signed_in',
} as const;
export type AuthStatus = (typeof AuthStatus)[keyof typeof AuthStatus];
/** local = offline profile (no tokens); cloud = identity session (keychain tokens). */
export const AuthKind = {
  Local: 'local',
  Cloud: 'cloud',
} as const;
export type AuthKind = (typeof AuthKind)[keyof typeof AuthKind];

// Browser-dev session persistence only. Native sessions live exclusively in the
// OS keychain; a missing bridge in a production build must never persist tokens.
const BROWSER_PERSIST_KEY = STORAGE_KEYS.devSession;

/** Bumped on sign-out so in-flight native persist cannot restore keychain session. */
let sessionPersistEpoch = 0;

const USER_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isPersistedUserId(userId: string): boolean {
  return USER_ID_RE.test(userId);
}

/** Native IPC uses "" for "no refresh token"; never treat empty as a real token. */
function normalizeRefreshToken(token: string | null | undefined): string | null {
  if (typeof token !== 'string') return null;
  const trimmed = token.trim();
  return trimmed.length > 0 ? trimmed : null;
}

interface PersistedSession {
  userId: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
}

function readStoredLocalProfileId(): string | null {
  const id = window.localStorage.getItem(STORAGE_KEYS.localProfileUserId);
  if (id && isPersistedUserId(id)) return id;
  return null;
}

function writeStoredLocalProfileId(userId: string): void {
  window.localStorage.setItem(STORAGE_KEYS.localProfileUserId, userId);
}

function resetUserScopedCaches(persistUserId?: string | null): void {
  resetUserScope(persistUserId ?? undefined);
}

function clearLocalAuthBannerDismissed(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEYS.localAuthBannerDismissed);
  } catch (err) {
    console.warn('[nordly:session] local auth banner clear failed', err);
  }
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
    refreshToken: normalizeRefreshToken(s.refreshToken),
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
    } catch (err) {
      console.warn('[nordly:session] undo stale keychain write failed', err);
    }
  }
}

/** Last in-flight keychain write — awaited on login/refresh so quit cannot race an empty keychain. */
let pendingNativePersist: Promise<void> | null = null;

function queueNativePersist(session: PersistedSession): Promise<void> {
  const epoch = sessionPersistEpoch;
  const pending = persistSessionToNative(session, epoch).catch((err: unknown) => {
    console.error('[nordly:session] native session persistence failed', err);
    throw err;
  });
  pendingNativePersist = pending;
  void pending
    .finally(() => {
      if (pendingNativePersist === pending) pendingNativePersist = null;
    })
    .catch(() => {
      /* rejection is observed by hydrate/applyTokens awaiters */
    });
  return pending;
}

export async function flushNativeSessionPersist(): Promise<void> {
  if (pendingNativePersist) await pendingNativePersist;
}

function writeBrowserPersist(s: PersistedSession): void {
  if (window.nordly || !import.meta.env.DEV) {
    clearBrowserPersist();
    return;
  }
  try {
    window.localStorage.setItem(BROWSER_PERSIST_KEY, JSON.stringify(s));
  } catch (err) {
    console.warn('[nordly:session] browser persist failed', err);
  }
}

function clearBrowserPersist(): void {
  try {
    window.localStorage.removeItem(BROWSER_PERSIST_KEY);
  } catch (err) {
    console.warn('[nordly:session] browser clear failed', err);
  }
}

interface SessionState {
  status: AuthStatus;
  /** null while status is unknown; always set when signed_in. */
  authKind: AuthKind | null;
  userId: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number;

  /** Bootstrap on app mount — keychain cloud session or local profile. */
  bootstrap: () => Promise<void>;

  /** Enter (or restore) a tokenless local profile so the shell works offline. */
  ensureLocalProfile: () => void;

  /** Called by deep-link handler / login modal after token arrives. */
  hydrate: (s: {
    userId: string;
    accessToken: string;
    refreshToken?: string;
    expiresAt: number;
  }) => Promise<void>;

  /** Clears cloud tokens, device OAuth, and starts a fresh local profile id. */
  clear: (opts?: { skipNativeLogout?: boolean }) => Promise<void>;

  /** Updates tokens after refresh — persists to browser + keychain. */
  applyTokens: (s: PersistedSession) => Promise<void>;
}

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

/** Keychain unlock after full quit can exceed a few seconds — do not treat that as guest. */
const BOOTSTRAP_IPC_TIMEOUT_MS = 30_000;

export const useSessionStore = create<SessionState>((set, get) => ({

  status: AuthStatus.Unknown,
  authKind: null,
  userId: null,
  accessToken: null,
  refreshToken: null,
  expiresAt: 0,

  ensureLocalProfile: () => {
    let userId = readStoredLocalProfileId();
    if (!userId) {
      userId = crypto.randomUUID();
      writeStoredLocalProfileId(userId);
    }
    const prev = get().userId;
    if (prev !== null && prev !== userId) {
      lockVault();
      clearVaultPrefsCache();
      resetUserScopedCaches(prev);
    }
    setDbUserId(userId);
    set({
      status: AuthStatus.SignedIn,
      authKind: AuthKind.Local,
      userId,
      accessToken: null,
      refreshToken: null,
      expiresAt: 0,
    });
  },

  bootstrap: async () => {
    const applyCloudSession = (s: PersistedSession): boolean => {
      if (!isPersistedUserId(s.userId)) {
        clearBrowserPersist();
        throw new Error('Invalid cloud session: userId');
      }
      const previousUserId = get().userId;
      if (previousUserId !== s.userId) {
        lockVault();
        clearVaultPrefsCache();
        resetUserScopedCaches(previousUserId);
      }
      writeStoredLocalProfileId(s.userId);
      setDbUserId(s.userId);
      set({
        status: AuthStatus.SignedIn,
        authKind: AuthKind.Cloud,
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
      if (persisted && applyCloudSession(persisted)) return;
      get().ensureLocalProfile();
      return;
    }

    clearBrowserPersist();
    let native: Awaited<ReturnType<typeof bridge.auth.session>> | null = null;
    try {
      native = await withTimeout(bridge.auth.session(), BOOTSTRAP_IPC_TIMEOUT_MS);
    } catch (err) {
      console.error('[nordly:session] native session bootstrap failed', err);
      try {
        await new Promise<void>((r) => {
          window.setTimeout(r, 750);
        });
        native = await withTimeout(bridge.auth.session(), BOOTSTRAP_IPC_TIMEOUT_MS);
      } catch (retryErr) {
        console.error('[nordly:session] native session bootstrap retry failed', retryErr);
        throw retryErr;
      }
    }

    if (native?.userId && (native.accessToken || normalizeRefreshToken(native.refreshToken))) {
      if (typeof native.expiresAt !== 'number') throw new Error('Invalid native session: missing expiresAt');
      applyCloudSession({
        userId: native.userId,
        accessToken: native.accessToken,
        refreshToken: normalizeRefreshToken(native.refreshToken),
        expiresAt: native.expiresAt,
      });
      return;
    }

    get().ensureLocalProfile();
  },

  hydrate: async ({ userId, accessToken, refreshToken, expiresAt }) => {
    if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) {
      throw new Error('Invalid session hydrate: missing expiresAt');
    }
    if (!isPersistedUserId(userId)) {
      throw new Error('Invalid session hydrate: userId');
    }
    const session: PersistedSession = {
      userId,
      accessToken,
      refreshToken: normalizeRefreshToken(refreshToken),
      expiresAt,
    };

    const current = get();
    // Never silently merge another profile's IndexedDB into this cloud account.
    // Shared-OS logins must not inherit prior local/cloud rows via rebind.
    if (current.userId && current.userId !== userId) {
      lockVault();
      clearVaultPrefsCache();
      resetUserScopedCaches(current.userId);
    }

    await queueNativePersist(session);
    writeStoredLocalProfileId(userId);
    clearLocalAuthBannerDismissed();
    setDbUserId(userId);
    set({
      status: AuthStatus.SignedIn,
      authKind: AuthKind.Cloud,
      userId,
      accessToken,
      refreshToken: session.refreshToken,
      expiresAt,
    });
    writeBrowserPersist(session);
  },

  applyTokens: async ({ userId, accessToken, refreshToken, expiresAt }) => {
    const current = get();
    if (
      current.authKind !== AuthKind.Cloud ||
      current.userId !== userId
    ) {
      lockVault();
      clearVaultPrefsCache();
      throw new Error('Cannot apply tokens for a different session user');
    }
    const session: PersistedSession = {
      userId,
      accessToken,
      refreshToken: normalizeRefreshToken(refreshToken),
      expiresAt,
    };
    await queueNativePersist(session);
    setDbUserId(userId);
    set({
      accessToken,
      refreshToken: session.refreshToken,
      expiresAt,
      authKind: AuthKind.Cloud,
    });
    writeBrowserPersist(session);
  },

  clear: async (opts) => {
    sessionPersistEpoch += 1;
    clearBrowserPersist();
    lockVault();
    clearVaultPrefsCache();
    resetUserScopedCaches(get().userId);
    useSyncStore.getState().setSessionReauthRequired(false);
    useDeviceRegistrationStore.getState().setDeviceRegistration(null);
    clearLocalAuthBannerDismissed();
    try {
      const { resetAuthRefreshState, rejectPendingCloudAuth } = await import('@shared/api/authSession');
      resetAuthRefreshState();
      rejectPendingCloudAuth();
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
    // New local profile id — do not leave the previous cloud/local IDB scope active
    // for the next person who signs in on this Mac.
    writeStoredLocalProfileId(crypto.randomUUID());
    get().ensureLocalProfile();
  },
}));
