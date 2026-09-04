import { isCloudEnabled } from '@shared/model/features';
import { canUseLocalApp, isSessionExpired } from '@shared/api/authSession';
import { useDeviceRegistrationStore } from '@shared/model/deviceRegistration';
import { useSessionStore } from '@shared/model/session';

export { canUseLocalApp } from '@shared/api/authSession';
export { isCloudEnabled } from '@shared/model/features';

/** Signed in with a usable session — notes API, publish. */
export function isCloudApiAvailable(): boolean {
  if (!isCloudEnabled()) return false;
  if (!canUseLocalApp()) return false;

  const { accessToken } = useSessionStore.getState();
  if (!accessToken) return false;
  if (isSessionExpired()) return false;

  return true;
}

/** Multi-device sync (tasks, focus, notes outbox) — registered device required. */
export function isSyncEnabled(): boolean {
  if (!isCloudApiAvailable()) return false;
  const registration = useDeviceRegistrationStore.getState().deviceRegistration;
  return Boolean(registration?.cloudSyncEnabled && registration.deviceId);
}

/** Queue local mutations even when the access token must be refreshed first.
 *  Local (tokenless) profiles enqueue too; push stays gated by isSyncEnabled(). */
export function isSyncQueueEnabled(): boolean {
  if (!isCloudEnabled()) return false;
  if (!canUseLocalApp()) return false;
  return true;
}
