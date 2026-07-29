import type { OAuthTokenBlob } from '@platform/ipc';
import { vendorFetch } from '@shared/api/http';
import {
  accessTokenFresh,
  clearOAuthPending,
  clearOAuthTokens,
  loadOAuthPending,
  loadOAuthTokens,
  saveOAuthPending,
  saveOAuthTokens,
} from '@shared/integrations/oauthTokens';
import { createPkcePair } from '@shared/integrations/pkce';
import { isZoomIntegrationAvailable } from '@shared/model/features';

const ZOOM_AUTH = 'https://zoom.us/oauth/authorize';
const ZOOM_TOKEN = 'https://zoom.us/oauth/token';
const SCOPES = 'meeting:write:meeting user:read:user';
/** Custom-scheme redirect registered on the Zoom OAuth app. */
export const ZOOM_REDIRECT_URI = 'nordly://settings';
const PENDING_TTL_MS = 10 * 60_000;

export class ZoomReauthError extends Error {
  constructor() {
    super('zoom_reauth_required');
    this.name = 'ZoomReauthError';
  }
}

export class ZoomNotConnectedError extends Error {
  constructor() {
    super('zoom_not_connected');
    this.name = 'ZoomNotConnectedError';
  }
}

function requireClientId(): string {
  const id = String(import.meta.env.VITE_ZOOM_CLIENT_ID ?? '').trim();
  if (!id) throw new Error('Zoom is not configured (missing VITE_ZOOM_CLIENT_ID)');
  return id;
}

function openExternal(url: string): void {
  if (window.nordly?.shell?.openExternal) {
    void window.nordly.shell.openExternal(url);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

function buildAuthUrl(state: string, challenge: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: requireClientId(),
    redirect_uri: ZOOM_REDIRECT_URI,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  // Zoom scopes are space-separated; append explicitly so encoding stays correct.
  params.set('scope', SCOPES);
  return `${ZOOM_AUTH}?${params}`;
}

async function exchangeCode(
  code: string,
  codeVerifier: string,
  redirectUri: string,
): Promise<OAuthTokenBlob> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: requireClientId(),
    code_verifier: codeVerifier,
  });
  const resp = await vendorFetch(ZOOM_TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Zoom token exchange failed: ${resp.status} ${text}`);
  }
  const json = (await resp.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!json.access_token) throw new Error('Zoom token exchange: missing access_token');
  if (!json.refresh_token) throw new Error('Zoom token exchange: missing refresh_token');
  const expiresIn = typeof json.expires_in === 'number' ? json.expires_in : 3600;
  return {
    provider: 'zoom',
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + expiresIn * 1000,
    reauthRequired: false,
  };
}

async function refreshAccess(refreshToken: string): Promise<OAuthTokenBlob> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: requireClientId(),
  });
  const resp = await vendorFetch(ZOOM_TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!resp.ok) {
    const text = await resp.text();
    if (resp.status === 400 || resp.status === 401 || /invalid_grant/i.test(text)) {
      const existing = await loadOAuthTokens('zoom');
      if (existing) {
        await saveOAuthTokens({ ...existing, reauthRequired: true, accessToken: '' });
      }
      throw new ZoomReauthError();
    }
    throw new Error(`Zoom token refresh failed: ${resp.status} ${text}`);
  }
  const json = (await resp.json()) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
  };
  if (!json.access_token) throw new Error('Zoom token refresh: missing access_token');
  const expiresIn = typeof json.expires_in === 'number' ? json.expires_in : 3600;
  const blob: OAuthTokenBlob = {
    provider: 'zoom',
    accessToken: json.access_token,
    refreshToken: json.refresh_token?.trim() ? json.refresh_token : refreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
    reauthRequired: false,
  };
  await saveOAuthTokens(blob);
  return blob;
}

/** Open Zoom authorize URL; completion arrives via nordly://settings?code&state. */
export async function beginZoomOAuth(): Promise<void> {
  if (!isZoomIntegrationAvailable()) {
    throw new Error('Zoom is not configured');
  }
  const { verifier, challenge, state } = await createPkcePair();
  await saveOAuthPending({
    provider: 'zoom',
    state,
    codeVerifier: verifier,
    redirectUri: ZOOM_REDIRECT_URI,
    expiresAt: Date.now() + PENDING_TTL_MS,
  });
  openExternal(buildAuthUrl(state, challenge));
}

export async function completeZoomOAuthFromDeepLink(code: string, state: string): Promise<void> {
  const pending = await loadOAuthPending('zoom');
  if (!pending) throw new Error('Zoom OAuth pending state missing');
  if (pending.expiresAt < Date.now()) {
    await clearOAuthPending('zoom');
    throw new Error('Zoom OAuth pending state expired');
  }
  if (pending.state !== state) throw new Error('Zoom OAuth state mismatch');
  const tokens = await exchangeCode(code, pending.codeVerifier, pending.redirectUri);
  await saveOAuthTokens(tokens);
  await clearOAuthPending('zoom');
}

export async function disconnectZoomOAuth(): Promise<void> {
  await clearOAuthTokens('zoom');
  await clearOAuthPending('zoom');
}

export async function requireZoomAccessToken(): Promise<string> {
  const tokens = await loadOAuthTokens('zoom');
  if (!tokens?.refreshToken) throw new ZoomNotConnectedError();
  if (tokens.reauthRequired) throw new ZoomReauthError();
  if (accessTokenFresh(tokens)) return tokens.accessToken;
  const refreshed = await refreshAccess(tokens.refreshToken);
  return refreshed.accessToken;
}
