import { DEV_BEARER_TOKEN } from '@shared/api/config';
import { useSessionStore } from '@shared/model/session';

/** Access token for authenticated REST calls. Fails if missing (except dev token in DEV). */
export function requireAccessToken(): string {
  const token = useSessionStore.getState().accessToken;
  if (token) return token;
  if (import.meta.env.DEV && DEV_BEARER_TOKEN) return DEV_BEARER_TOKEN;
  throw new Error('Missing access token for authenticated API call');
}

export function syncAuthHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { authorization: `Bearer ${requireAccessToken()}`, ...extra };
}
