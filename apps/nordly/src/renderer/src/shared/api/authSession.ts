import { useSessionStore } from '@shared/model/session';
import { stopSyncEngine } from '@shared/sync/SyncEngine';

let clearingUnauthorized = false;

/** Sign out once when the backend rejects our bearer token. */
export async function handleUnauthorized(): Promise<void> {
  if (clearingUnauthorized) return;
  const { status } = useSessionStore.getState();
  if (status !== 'signed_in') return;

  clearingUnauthorized = true;
  try {
    stopSyncEngine();
    await useSessionStore.getState().clear();
  } finally {
    clearingUnauthorized = false;
  }
}

export function isSessionExpired(): boolean {
  const { expiresAt } = useSessionStore.getState();
  return expiresAt > 0 && Date.now() > expiresAt;
}
