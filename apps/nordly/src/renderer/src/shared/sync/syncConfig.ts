import { isCloudEnabled } from '@shared/model/features';
import { canUseLocalApp, isSessionExpired } from '@shared/api/authSession';
import { useSessionStore } from '@shared/model/session';
import { useFeatureUsageStore } from '@shared/model/featureUsage';
import { useSyncStore } from '@shared/model/sync';

export function canReachNetwork(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine;
}

export { canUseLocalApp } from '@shared/api/authSession';
export { isCloudEnabled } from '@shared/model/features';

/** Signed in with a usable session — notes API, publish, billing. */
export function isCloudApiAvailable(): boolean {
  if (!isCloudEnabled()) return false;
  if (!canUseLocalApp()) return false;
  if (useSyncStore.getState().sessionReauthRequired) return false;

  const { accessToken, refreshToken } = useSessionStore.getState();
  if (!accessToken && !refreshToken) return false;
  if (!accessToken) return false;
  if (isSessionExpired()) return false;

  return true;
}

/** Multi-device sync (tasks, focus, notes outbox) — registered device required. */
export function isSyncEnabled(): boolean {
  if (!isCloudApiAvailable()) return false;
  if (useSyncStore.getState().cloudSyncBlocked) return false;

  const reg = useFeatureUsageStore.getState().deviceRegistration;
  if (reg != null && !reg.cloudSyncEnabled) return false;

  return true;
}
