import { isCloudEnabled } from '@shared/model/features';
import { canUseLocalApp, isSessionExpired } from '@shared/api/authSession';
import { useSessionStore } from '@shared/model/session';
import { useSyncStore } from '@shared/model/sync';

export function canReachNetwork(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine;
}

export { canUseLocalApp } from '@shared/api/authSession';
export { isCloudEnabled } from '@shared/model/features';

export function isSyncEnabled(): boolean {
  if (!isCloudEnabled()) return false;
  if (!canUseLocalApp()) return false;
  if (useSyncStore.getState().sessionReauthRequired) return false;
  if (useSyncStore.getState().cloudSyncBlocked) return false;

  const { accessToken, refreshToken } = useSessionStore.getState();
  if (!accessToken && !refreshToken) return false;

  if (isSessionExpired()) {
    if (!refreshToken) return false;
    if (!canReachNetwork()) return false;
  }

  return true;
}
