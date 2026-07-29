import type { OAuthPendingBlob, OAuthProvider, OAuthTokenBlob } from '@platform/ipc';
import { getDbUserId } from '@shared/db/nordlyDb';

function requireOauthBridge() {
  const oauth = window.nordly?.oauth;
  if (!oauth) throw new Error('OAuth keychain bridge unavailable');
  return oauth;
}

function requireOAuthUserId(explicit?: string): string {
  const userId = explicit?.trim() || getDbUserId()?.trim() || '';
  if (!userId) throw new Error('OAuth requires a signed-in user id');
  return userId;
}

export async function loadOAuthTokens(
  provider: OAuthProvider,
  userId?: string,
): Promise<OAuthTokenBlob | null> {
  return requireOauthBridge().tokensLoad(provider, requireOAuthUserId(userId));
}

export async function saveOAuthTokens(
  tokens: OAuthTokenBlob,
  userId?: string,
): Promise<void> {
  await requireOauthBridge().tokensSave(tokens, requireOAuthUserId(userId));
}

export async function clearOAuthTokens(provider: OAuthProvider, userId?: string): Promise<void> {
  await requireOauthBridge().tokensClear(provider, requireOAuthUserId(userId));
}

export async function loadOAuthPending(
  provider: OAuthProvider,
  userId?: string,
): Promise<OAuthPendingBlob | null> {
  return requireOauthBridge().pendingLoad(provider, requireOAuthUserId(userId));
}

export async function saveOAuthPending(
  pending: OAuthPendingBlob,
  userId?: string,
): Promise<void> {
  await requireOauthBridge().pendingSave(pending, requireOAuthUserId(userId));
}

export async function clearOAuthPending(provider: OAuthProvider, userId?: string): Promise<void> {
  await requireOauthBridge().pendingClear(provider, requireOAuthUserId(userId));
}

/** Clear Google + Zoom tokens and pending PKCE for a Nordly user (sign-out / user switch). */
export async function clearAllDeviceOAuth(userId: string): Promise<void> {
  const id = requireOAuthUserId(userId);
  await Promise.all([
    clearOAuthTokens('google', id),
    clearOAuthTokens('zoom', id),
    clearOAuthPending('google', id),
    clearOAuthPending('zoom', id),
  ]);
}

export async function startOAuthLoopback(): Promise<string> {
  return requireOauthBridge().loopbackStart();
}

export async function waitOAuthLoopback(expectedState: string, timeoutMs: number): Promise<string> {
  return requireOauthBridge().loopbackWait(expectedState, timeoutMs);
}

export async function cancelOAuthLoopback(): Promise<void> {
  await requireOauthBridge().loopbackCancel();
}

const REFRESH_SKEW_MS = 60_000;

export function accessTokenFresh(tokens: OAuthTokenBlob, now = Date.now()): boolean {
  if (tokens.reauthRequired) return false;
  if (!tokens.accessToken) return false;
  return tokens.expiresAt > now + REFRESH_SKEW_MS;
}
