import type { OAuthTokenBlob } from '@platform/ipc';
import { vendorFetch } from '@shared/api/http';
import {
  accessTokenFresh,
  cancelOAuthLoopback,
  clearOAuthPending,
  clearOAuthTokens,
  loadOAuthPending,
  loadOAuthTokens,
  saveOAuthPending,
  saveOAuthTokens,
  startOAuthLoopback,
  waitOAuthLoopback,
} from '@shared/integrations/oauthTokens';
import { createPkcePair } from '@shared/integrations/pkce';
import { isGoogleIntegrationAvailable } from '@shared/model/features';

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
].join(' ');

const PENDING_TTL_MS = 10 * 60_000;
const LOOPBACK_TIMEOUT_MS = 3 * 60_000;

export class GoogleReauthError extends Error {
  constructor() {
    super('google_reauth_required');
    this.name = 'GoogleReauthError';
  }
}

export class GoogleNotConnectedError extends Error {
  constructor() {
    super('google_not_connected');
    this.name = 'GoogleNotConnectedError';
  }
}

function requireClientId(): string {
  const id = String(import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '').trim();
  if (!id) throw new Error('Google Calendar is not configured (missing VITE_GOOGLE_CLIENT_ID)');
  return id;
}

function openExternal(url: string): void {
  if (window.nordly?.shell?.openExternal) {
    void window.nordly.shell.openExternal(url);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

function buildAuthUrl(redirectUri: string, state: string, challenge: string): string {
  const params = new URLSearchParams({
    client_id: requireClientId(),
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'consent',
  });
  return `${GOOGLE_AUTH}?${params}`;
}

async function exchangeCode(
  code: string,
  codeVerifier: string,
  redirectUri: string,
): Promise<OAuthTokenBlob> {
  const body = new URLSearchParams({
    client_id: requireClientId(),
    code,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  const resp = await vendorFetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Google token exchange failed: ${resp.status} ${text}`);
  }
  const json = (await resp.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!json.access_token) throw new Error('Google token exchange: missing access_token');
  if (!json.refresh_token) throw new Error('Google token exchange: missing refresh_token');
  const expiresIn = typeof json.expires_in === 'number' ? json.expires_in : 3600;
  return {
    provider: 'google',
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + expiresIn * 1000,
    reauthRequired: false,
  };
}

async function refreshAccess(refreshToken: string): Promise<OAuthTokenBlob> {
  const body = new URLSearchParams({
    client_id: requireClientId(),
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  const resp = await vendorFetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!resp.ok) {
    const text = await resp.text();
    if (resp.status === 400 || resp.status === 401 || /invalid_grant/i.test(text)) {
      const existing = await loadOAuthTokens('google');
      if (existing) {
        await saveOAuthTokens({ ...existing, reauthRequired: true, accessToken: '' });
      }
      throw new GoogleReauthError();
    }
    throw new Error(`Google token refresh failed: ${resp.status} ${text}`);
  }
  const json = (await resp.json()) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
  };
  if (!json.access_token) throw new Error('Google token refresh: missing access_token');
  const expiresIn = typeof json.expires_in === 'number' ? json.expires_in : 3600;
  const blob: OAuthTokenBlob = {
    provider: 'google',
    accessToken: json.access_token,
    refreshToken: json.refresh_token?.trim() ? json.refresh_token : refreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
    reauthRequired: false,
  };
  await saveOAuthTokens(blob);
  return blob;
}

/** Start Google Desktop PKCE via loopback redirect (http://127.0.0.1:port/). */
export async function beginGoogleOAuth(): Promise<void> {
  if (!isGoogleIntegrationAvailable()) {
    throw new Error('Google Calendar is not configured');
  }
  let redirectUri: string | null = null;
  try {
    redirectUri = await startOAuthLoopback();
    const { verifier, challenge, state } = await createPkcePair();
    await saveOAuthPending({
      provider: 'google',
      state,
      codeVerifier: verifier,
      redirectUri,
      expiresAt: Date.now() + PENDING_TTL_MS,
    });
    openExternal(buildAuthUrl(redirectUri, state, challenge));
    const code = await waitOAuthLoopback(state, LOOPBACK_TIMEOUT_MS);
    const tokens = await exchangeCode(code, verifier, redirectUri);
    await saveOAuthTokens(tokens);
    await clearOAuthPending('google');
  } catch (err) {
    await cancelOAuthLoopback().catch(() => undefined);
    await clearOAuthPending('google').catch(() => undefined);
    throw err;
  }
}

/** Complete Google OAuth when redirected via nordly:// deep link (code + state). */
export async function completeGoogleOAuthFromDeepLink(
  code: string,
  state: string,
): Promise<void> {
  const pending = await loadOAuthPending('google');
  if (!pending) throw new Error('Google OAuth pending state missing');
  if (pending.expiresAt < Date.now()) {
    await clearOAuthPending('google');
    throw new Error('Google OAuth pending state expired');
  }
  if (pending.state !== state) throw new Error('Google OAuth state mismatch');
  const tokens = await exchangeCode(code, pending.codeVerifier, pending.redirectUri);
  await saveOAuthTokens(tokens);
  await clearOAuthPending('google');
}

export async function disconnectGoogleOAuth(): Promise<void> {
  await clearOAuthTokens('google');
  await clearOAuthPending('google');
  await cancelOAuthLoopback().catch(() => undefined);
}

export async function requireGoogleAccessToken(): Promise<string> {
  const tokens = await loadOAuthTokens('google');
  if (!tokens?.refreshToken) throw new GoogleNotConnectedError();
  if (tokens.reauthRequired) throw new GoogleReauthError();
  if (accessTokenFresh(tokens)) return tokens.accessToken;
  const refreshed = await refreshAccess(tokens.refreshToken);
  return refreshed.accessToken;
}

export function googleAuthUrlForTests(redirectUri: string, state: string, challenge: string): string {
  return buildAuthUrl(redirectUri, state, challenge);
}
