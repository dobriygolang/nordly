import { useSessionStore } from '@shared/model/session';
import { getDeviceId } from '@shared/api/device';

/** Access token for authenticated REST calls. Fails if missing. */
export function requireAccessToken(): string {
  const token = useSessionStore.getState().accessToken;
  if (token) return token;
  throw new Error('Missing access token for authenticated API call');
}

export function syncAuthHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { authorization: `Bearer ${requireAccessToken()}`, ...extra };
  const deviceId = getDeviceId();
  if (deviceId) headers['X-Device-ID'] = deviceId;
  return headers;
}
