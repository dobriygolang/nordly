import { useSessionStore } from '@shared/model/session';

/** Access token for authenticated REST calls. Fails if missing. */
export function requireAccessToken(): string {
  const token = useSessionStore.getState().accessToken;
  if (token) return token;
  throw new Error('Missing access token for authenticated API call');
}

export function syncAuthHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { authorization: `Bearer ${requireAccessToken()}`, ...extra };
}
