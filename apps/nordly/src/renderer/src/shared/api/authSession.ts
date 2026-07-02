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

async function persistRefreshedTokens(tokens: {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}): Promise<void> {
  const { userId } = useSessionStore.getState();
  if (!userId) return;

  useSessionStore.getState().applyTokens({
    userId,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
  });
  setSessionReauthRequired(false);
}

/** Rotate refresh token and persist new pair to store + keychain. */
export async function refreshAccessToken(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const { refreshToken } = useSessionStore.getState();
    if (!refreshToken) {
      if (isSessionExpired()) setSessionReauthRequired(true);
      return false;
    }
    if (!canReachNetwork()) {
      if (isSessionExpired()) setSessionReauthRequired(true);
      return false;
    }

    try {
      const resp = await rawAuthFetch(apiPath('/v1/auth/refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!resp.ok) {
        if (isSessionExpired()) setSessionReauthRequired(true);
        return false;
      }

      const body = (await resp.json()) as Record<string, unknown>;
      const accessToken = requireJsonString(body, 'accessToken');
      const nextRefresh = requireJsonString(body, 'refreshToken');

      const expiresAt = readJwtExpMs(accessToken);
      await persistRefreshedTokens({ accessToken, refreshToken: nextRefresh, expiresAt });
      return true;
    } catch {
      if (isSessionExpired()) setSessionReauthRequired(true);
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

/** Proactive refresh before sync/API when access token is stale. */
export async function ensureAccessTokenForSync(): Promise<boolean> {
  const { accessToken, refreshToken } = useSessionStore.getState();
  if (!accessToken && !refreshToken) return false;
  if (!isSessionExpired() && !isAccessTokenExpiringSoon()) return true;
  if (!canReachNetwork()) {
    if (isSessionExpired()) setSessionReauthRequired(true);
    return !isSessionExpired();
  }
  return refreshAccessToken();
}

/** Sign out on explicit logout only; failed refresh keeps local session for offline use. */
export async function handleUnauthorized(): Promise<void> {
  if (clearingUnauthorized) return;
  const { status } = useSessionStore.getState();
  if (status !== 'signed_in') return;

  if (!canReachNetwork()) {
    setSessionReauthRequired(true);
    return;
  }

  const refreshed = await refreshAccessToken();
  if (refreshed) {
    setSessionReauthRequired(false);
    return;
  }

  setSessionReauthRequired(true);
}

export function startSessionRefreshLoop(): () => void {
  const tick = (): void => {
    const { status } = useSessionStore.getState();
    if (status !== 'signed_in') return;

    if (!canReachNetwork()) {
      if (isSessionExpired()) setSessionReauthRequired(true);
      return;
    }

    if (isSessionExpired() || isAccessTokenExpiringSoon()) {
      void refreshAccessToken();
    } else {
      setSessionReauthRequired(false);
    }
  };

  tick();
  const intervalId = window.setInterval(tick, 60_000);
  window.addEventListener('focus', tick);
  window.addEventListener('online', tick);

  return () => {
    window.clearInterval(intervalId);
    window.removeEventListener('focus', tick);
    window.removeEventListener('online', tick);
  };
}
