import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

import { API_BASE_URL } from '@shared/api/config';
import { requireJsonString } from '@shared/api/json';
import { isNativeHttpInTauri } from '@platform/runtime';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { jwtExpiryMs } from '@shared/lib/jwt';
import { canReachNetwork } from '@shared/lib/network';
import { isCloudEnabled } from '@shared/model/features';
import {
  AuthKind,
  AuthStatus,
  useSessionStore,
} from '@shared/model/session';
import { useSyncStore } from '@shared/model/sync';

const REFRESH_SKEW_MS = 60_000;

let refreshInFlight: Promise<boolean> | null = null;
/** After a definitive refresh failure (400/401), stop hammering /v1/auth/refresh. */
let refreshRejected = false;

type CloudAuthWaiter = {
  resolve: (ok: boolean) => void;
};
let cloudAuthWaiters: CloudAuthWaiter[] = [];

function apiPath(path: string): string {
  const base = API_BASE_URL.replace(/\/$/, '');
  return base ? `${base}${path}` : path;
}

/** Raw HTTP for auth endpoints — bypasses 401 handler to avoid refresh loops. */
async function rawAuthFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return isNativeHttpInTauri() ? tauriFetch(input, init) : fetch(input, init);
}

function setSessionReauthRequired(required: boolean): void {
  useSyncStore.getState().setSessionReauthRequired(required);
}

/** Call after a fresh login so refresh can run again. */
export function resetAuthRefreshState(): void {
  refreshRejected = false;
  setSessionReauthRequired(false);
  void import('@shared/sync/SyncEngine').then(({ resetSyncDeviceSession }) => {
    resetSyncDeviceSession();
  });
}

export function isSessionExpired(): boolean {
  const { expiresAt } = useSessionStore.getState();
  return expiresAt > 0 && Date.now() > expiresAt;
}

export function isAccessTokenExpiringSoon(): boolean {
  const { expiresAt } = useSessionStore.getState();
  if (expiresAt <= 0) return false;
  return Date.now() >= expiresAt - REFRESH_SKEW_MS;
}

export function canUseLocalApp(): boolean {
  const { status, userId } = useSessionStore.getState();
  return status === AuthStatus.SignedIn && Boolean(userId);
}

export function isLocalAuthProfile(): boolean {
  const { status, authKind } = useSessionStore.getState();
  return status === AuthStatus.SignedIn && authKind === AuthKind.Local;
}

/** True when cloud JWT/session can call authenticated APIs (or refresh soon). */
export function hasCloudAuthSession(): boolean {
  const { status, authKind, accessToken, refreshToken } = useSessionStore.getState();
  if (
    status !== AuthStatus.SignedIn ||
    authKind !== AuthKind.Cloud
  ) {
    return false;
  }
  return Boolean(accessToken || refreshToken);
}

/** Definitive: no way to mint a new access token without interactive login. */
function markReauthRequired(): void {
  // Local profiles never had tokens — soft banner / ensureCloudAuth, not reauth lock.
  if (isLocalAuthProfile()) return;
  refreshRejected = true;
  setSessionReauthRequired(true);
}

function settleCloudAuthWaiters(ok: boolean): void {
  const waiters = cloudAuthWaiters;
  cloudAuthWaiters = [];
  for (const w of waiters) w.resolve(ok);
}

/** Resolve pending ensureCloudAuth() waiters after login success. */
export function resolvePendingCloudAuth(): void {
  settleCloudAuthWaiters(true);
}

/** Cancel pending ensureCloudAuth() waiters (overlay close / sign-out). */
export function rejectPendingCloudAuth(): void {
  settleCloudAuthWaiters(false);
}

/**
 * Gate intentional cloud actions (publish, share, OAuth connect).
 * Never call from silent outbox / background sync.
 * Opens the auth overlay when the user is on a local profile or needs reauth.
 */
export async function ensureCloudAuth(): Promise<boolean> {
  if (!isCloudEnabled()) return false;

  const { status, authKind, accessToken, refreshToken } = useSessionStore.getState();
  if (status !== AuthStatus.SignedIn) return false;

  if (authKind === AuthKind.Cloud) {
    if (accessToken && !isSessionExpired()) return true;
    if (refreshToken && canReachNetwork()) {
      if (await refreshAccessToken()) return true;
    }
    if (accessToken && !isSessionExpired()) return true;
    // Offline with a refresh token: do not open a modal; caller surfaces network.
    if (refreshToken && !canReachNetwork() && !refreshRejected) {
      return false;
    }
  }

  return new Promise<boolean>((resolve) => {
    cloudAuthWaiters.push({ resolve });
    window.dispatchEvent(new Event(NORDLY_EVENTS.openReauthLogin));
  });
}

async function persistRefreshedTokens(
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
  },
  expectedUserId: string,
  expectedRefreshToken: string,
): Promise<void> {
  const current = useSessionStore.getState();
  if (current.userId !== expectedUserId || current.refreshToken !== expectedRefreshToken) {
    throw new Error('Discarding refreshed tokens for a stale session');
  }

  await useSessionStore.getState().applyTokens({
    userId: expectedUserId,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
  });
  refreshRejected = false;
  setSessionReauthRequired(false);
}

/** Rotate refresh token and persist new pair to store + keychain. */
export async function refreshAccessToken(): Promise<boolean> {
  if (refreshRejected) return false;
  if (refreshInFlight) return refreshInFlight;

  const refreshPromise = (async () => {
    try {
      const { userId, refreshToken, authKind } = useSessionStore.getState();
      if (authKind === AuthKind.Local) return false;
      if (!refreshToken) {
        // Cannot recover without interactive login — even offline.
        if (isSessionExpired()) markReauthRequired();
        return false;
      }
      if (!userId) throw new Error('Cannot refresh tokens without a signed-in user');
      // Offline + expired access: keep local session silently (no reauth banner).
      if (!canReachNetwork()) return false;

      const resp = await rawAuthFetch(apiPath('/v1/auth/refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!resp.ok) {
        // Only 400/401 are definitive; network blips / 5xx must not lock the user out.
        if (resp.status === 400 || resp.status === 401) {
          markReauthRequired();
        }
        return false;
      }

      const body = (await resp.json()) as Record<string, unknown>;
      const accessToken = requireJsonString(body, 'accessToken');
      const nextRefresh = requireJsonString(body, 'refreshToken');

      const expiresAt = jwtExpiryMs(accessToken);
      await persistRefreshedTokens(
        { accessToken, refreshToken: nextRefresh, expiresAt },
        userId,
        refreshToken,
      );
      return true;
    } catch (err) {
      console.error('[nordly:auth] token refresh failed', err);
      // Transient network / parse errors: keep local session, retry later.
      return false;
    }
  })();
  refreshInFlight = refreshPromise;
  try {
    return await refreshPromise;
  } finally {
    if (refreshInFlight === refreshPromise) refreshInFlight = null;
  }
}

/** Proactive refresh before sync/API when access token is stale. */
export async function ensureAccessTokenForSync(): Promise<boolean> {
  const { accessToken, refreshToken, authKind } = useSessionStore.getState();
  // Local profiles may enqueue outbox; push waits until cloud auth exists.
  if (authKind === AuthKind.Local) return false;
  if (!accessToken && !refreshToken) return false;
  if (accessToken && !isSessionExpired() && !isAccessTokenExpiringSoon()) {
    refreshRejected = false;
    setSessionReauthRequired(false);
    return true;
  }
  if (refreshRejected) {
    setSessionReauthRequired(true);
    return false;
  }
  if (!canReachNetwork()) {
    // Offline grace: do not demand reauth; sync simply cannot run.
    return !isSessionExpired();
  }
  const refreshed = await refreshAccessToken();
  if (refreshed) return true;
  // Refresh failed but access JWT may still be valid for a short while.
  return !isSessionExpired();
}

/** Sign out on explicit logout only; failed refresh keeps local session for offline use. */
export async function handleUnauthorized(): Promise<void> {
  const { status } = useSessionStore.getState();
  if (status !== AuthStatus.SignedIn) return;

  if (refreshRejected) {
    setSessionReauthRequired(true);
    return;
  }

  // Offline 401s are not definitive — keep local session without a reauth banner.
  if (!canReachNetwork()) return;

  const refreshed = await refreshAccessToken();
  if (refreshed) {
    setSessionReauthRequired(false);
    return;
  }

  if (refreshRejected) {
    setSessionReauthRequired(true);
  }
}

export function startSessionRefreshLoop(): () => void {
  const tick = (): void => {
    if (document.hidden) return;
    const { status, authKind } = useSessionStore.getState();
    if (status !== AuthStatus.SignedIn) return;
    // Tokenless local profile — never hammer refresh or raise reauth from the loop.
    if (authKind === AuthKind.Local) return;

    if (!canReachNetwork()) {
      // Stay silent offline — local app keeps working with an expired access JWT.
      return;
    }

    if (!isSessionExpired() && !isAccessTokenExpiringSoon()) {
      setSessionReauthRequired(false);
      return;
    }

    if (refreshRejected) {
      setSessionReauthRequired(true);
      return;
    }

    void refreshAccessToken().catch((err: unknown) => {
      console.error('[nordly:auth] background token refresh failed', err);
    });
  };

  const onVisible = (): void => {
    if (document.visibilityState === 'visible') tick();
  };

  tick();
  const startupTimer = window.setTimeout(tick, 2_000);
  const intervalId = window.setInterval(tick, 60_000);
  window.addEventListener('focus', tick);
  window.addEventListener('online', tick);
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    window.clearTimeout(startupTimer);
    window.clearInterval(intervalId);
    window.removeEventListener('focus', tick);
    window.removeEventListener('online', tick);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
