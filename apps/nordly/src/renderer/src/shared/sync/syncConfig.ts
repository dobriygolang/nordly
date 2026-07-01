import { LOCAL_ONLY } from '@app/config/features';
import { canUseLocalApp, isSessionExpired } from '@shared/api/authSession';
import { useSessionStore } from '@shared/model/session';

export function canReachNetwork(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine;
}

export { canUseLocalApp };

export function isSyncEnabled(): boolean {
  if (LOCAL_ONLY) return false;
  if (!canUseLocalApp()) return false;

  const { accessToken, refreshToken } = useSessionStore.getState();
  if (!accessToken && !refreshToken) return false;

  if (isSessionExpired()) {
    if (!refreshToken) return false;
    if (!canReachNetwork()) return false;
  }

  return true;
}
