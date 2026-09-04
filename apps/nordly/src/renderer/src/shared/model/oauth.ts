export const OAuthStatus = {
  Connected: 'connected',
  Error: 'error',
} as const;
export type OAuthStatus = (typeof OAuthStatus)[keyof typeof OAuthStatus];

const OAUTH_STATUSES = new Set<string>(Object.values(OAuthStatus));

export function isOAuthStatus(value: string): value is OAuthStatus {
  return OAUTH_STATUSES.has(value);
}

export function sanitizeOAuthStatus(raw: string | null): OAuthStatus | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  return isOAuthStatus(value) ? value : null;
}
