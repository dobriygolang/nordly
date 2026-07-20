import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

import { API_BASE_URL } from '@shared/api/config';
import { requireJsonString } from '@shared/api/json';
import { isNativeHttpInTauri } from '@platform/runtime';
import { useSessionStore } from '@shared/model/session';
import { useSyncStore } from '@shared/model/sync';

function canReachNetwork(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine;
}

const REFRESH_SKEW_MS = 60_000;

let refreshInFlight: Promise<boolean> | null = null;
/** After a definitive refresh failure (400/401), stop hammering /v1/auth/refresh. */
let refreshRejected = false;

function apiPath(path: string): string {
  const base = API_BASE_URL.replace(/\/$/, '');
  return base ? `${base}${path}` : path;
}

function readJwtExpMs(token: string): number {
  const payload = token.split('.')[1];
  if (!payload) throw new Error('invalid auth token: missing payload');
  const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
  if (typeof json.exp !== 'number') throw new Error('invalid auth token: missing exp');
  return json.exp * 1000;
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
  useSyncStore.getState().setCloudSyncBlocked(false);
  void import('@shared/api/registerSyncDevice').then(({ resetDeviceRegisterCache }) => {
    resetDeviceRegisterCache();
  });
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
  return status === 'signed_in' && Boolean(userId);
}

/** Definitive: no way to mint a new access token without interactive login. */
function markReauthRequired(): void {
  refreshRejected = true;
  setSessionReauthRequired(true);
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
      const { userId, refreshToken } = useSessionStore.getState();
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

      const expiresAt = readJwtExpMs(accessToken);
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
  const { accessToken, refreshToken } = useSessionStore.getState();
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
  if (status !== 'signed_in') return;

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
    const { status } = useSessionStore.getState();
    if (status !== 'signed_in') return;

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

  tick();
  const startupTimer = window.setTimeout(tick, 2_000);
  const intervalId = window.setInterval(tick, 60_000);
  window.addEventListener('focus', tick);
  window.addEventListener('online', tick);

  return () => {
    window.clearTimeout(startupTimer);
    window.clearInterval(intervalId);
    window.removeEventListener('focus', tick);
    window.removeEventListener('online', tick);
  };
}
