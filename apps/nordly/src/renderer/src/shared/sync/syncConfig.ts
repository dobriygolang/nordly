import { LOCAL_ONLY } from '@app/config/features';
import { isSessionExpired } from '@shared/api/authSession';
import { useSessionStore } from '@shared/model/session';

export function isSyncEnabled(): boolean {
  if (LOCAL_ONLY) return false;
  if (useSessionStore.getState().status !== 'signed_in') return false;
  if (isSessionExpired()) return false;
  return Boolean(useSessionStore.getState().accessToken);
}

export function canReachNetwork(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine;
}
