export const OAuthStatus = {
  Connected: 'connected',
  Error: 'error',
} as const
export type OAuthStatus = (typeof OAuthStatus)[keyof typeof OAuthStatus]
const OAUTH_STATUSES = new Set<string>(Object.values(OAuthStatus))
const OAUTH_DETAIL_RE = /^[a-zA-Z0-9._-]{1,200}$/

export function sanitizeOAuthStatus(raw: string | null): OAuthStatus | null {
  if (!raw) return null
  const value = raw.trim().toLowerCase()
  return OAUTH_STATUSES.has(value) ? (value as OAuthStatus) : null
}

export function sanitizeOAuthDetail(raw: string | null): string | null {
  if (!raw) return null
  const value = raw.trim()
  return OAUTH_DETAIL_RE.test(value) ? value : null
}
