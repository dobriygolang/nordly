import { HEALTH_CHECK_URL } from '@shared/api/config';
import { apiFetch } from '@shared/api/http';
import { ensureAccessTokenForSync } from '@shared/api/authSession';
import { ensureDevice } from '@shared/api/device';
import { DeviceRegisterError, registerSyncDevice } from '@shared/api/registerSyncDevice';
import { usePlanUsageStore } from '@shared/model/planUsage';
import { subscribeVault } from '@shared/crypto/vault';
import { getDbUserId } from '@shared/db/nordlyDb';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { useSyncStore } from '@shared/model/sync';
import { bumpOutboxAttempts, listOutbox, outboxCount, resetOutboxAttempts } from '@shared/sync/outbox';
import { requireSyncHandlers } from '@shared/sync/registry';
import { isSyncDeferredError, SyncError } from '@shared/sync/errors';
import { canReachNetwork, isSyncEnabled } from '@shared/sync/syncConfig';
import type { OutboxEntry } from '@shared/sync/types';

type SyncOptions = {
  /** When true, reject if offline instead of silently queueing. */
  explicit?: boolean;
  /** When true, reset outbox attempts and reconcile local unsynced state before push. */
  retry?: boolean;
};

const DEBOUNCE_MS = 3000;
const INTERVAL_MS = 60_000;
const MAX_ATTEMPTS = 8;

let debounceTimer: number | null = null;
let intervalId: number | null = null;
let started = false;
let syncTail: Promise<void> = Promise.resolve();

async function probeServer(): Promise<boolean> {
  if (!canReachNetwork()) return false;
  try {
    const resp = await apiFetch(HEALTH_CHECK_URL, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
    return resp.status < 500;
  } catch {
    return false;
  }
}

async function pushEntry(entry: OutboxEntry): Promise<void> {
  const h = requireSyncHandlers();
  if (entry.domain === 'notes') await h.pushNotesOutbox(entry);
  else if (entry.domain === 'tasks') await h.pushTasksOutbox(entry);
  else if (entry.domain === 'focus') await h.pushFocusOutbox(entry);
}

async function pullAll(): Promise<void> {
  const h = requireSyncHandlers();
  await h.pullNotes();
  await h.pullTasks();
  await h.pullFocus();
}

function enqueueSync(options?: SyncOptions): Promise<void> {
  const job = syncTail.then(() => runSync(options));
  syncTail = job.catch((err: unknown) => {
    if (!options?.explicit) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[nordly:sync]', message, err);
      useSyncStore.getState().setLastError(message);
    }
  });
  return job;
}

async function runSync(options?: SyncOptions): Promise<void> {
  if (!isSyncEnabled() || !getDbUserId()) return;

  const store = useSyncStore.getState();
  if (!canReachNetwork()) {
    store.setStatus('offline');
    store.setServerReachable(false);
    store.setLastError(null);
    if (options?.explicit) {
      throw new SyncError('no_network', 'No internet connection');
    }
    return;
  }

  const tokenReady = await ensureAccessTokenForSync();
  if (!tokenReady) {
    store.setStatus('offline');
    store.setLastError(null);
    if (options?.explicit) {
      throw new SyncError('session_expired', 'Session expired');
    }
    return;
  }

  try {
    await ensureDevice({ appVersion: '0.0.1' });
    const reg = await registerSyncDevice({ appVersion: '0.0.1' });
    usePlanUsageStore.getState().setDeviceRegistration({
      deviceId: reg.deviceId,
      devicesRegistered: reg.devicesRegistered,
      deviceLimit: reg.deviceLimit,
      cloudSyncEnabled: reg.cloudSyncEnabled,
    });
    store.setCloudSyncBlocked(false);
  } catch (err) {
    if (err instanceof DeviceRegisterError) {
      store.setCloudSyncBlocked(true, err.code);
      store.setStatus('idle');
      store.setLastError(null);
      if (options?.explicit) {
        throw new SyncError(err.code, err.message);
      }
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    store.setLastError(message);
    if (options?.explicit) {
      throw err instanceof Error ? err : new SyncError('device_register_failed', message);
    }
    return;
  }

  const reachable = await probeServer();
  store.setServerReachable(reachable);
  if (!reachable) {
    store.setStatus('offline');
    store.setLastError(null);
    if (options?.explicit) {
      throw new SyncError('server_unreachable', 'Cannot reach server');
    }
    return;
  }

  if (options?.retry) {
    store.setLastError(null);
    await resetOutboxAttempts();
  }

  store.setStatus('syncing');
  try {
    await requireSyncHandlers().reconcileOutbox();
    const queue = await listOutbox();
    store.setPendingCount(queue.length);

    let deferred = false;
    let pushError: string | null = null;
    let exhausted = 0;

    for (const entry of queue) {
      if (entry.attempts >= MAX_ATTEMPTS) {
        exhausted++;
        continue;
      }
      try {
        await pushEntry(entry);
      } catch (err) {
        if (isSyncDeferredError(err)) {
          deferred = true;
          continue;
        }
        const attempts = await bumpOutboxAttempts(entry);
        const message = err instanceof Error ? err.message : String(err);
        if (attempts >= MAX_ATTEMPTS) {
          pushError = `Sync failed on ${entry.domain}/${entry.op} (${entry.entityId}) after ${MAX_ATTEMPTS} attempts: ${message}`;
          console.error('[nordly:sync]', pushError, entry);
        } else if (!pushError) {
          pushError = message;
        }
      }
    }

    let pullError: string | null = null;
    try {
      await pullAll();
    } catch (err) {
      if (isSyncDeferredError(err)) {
        deferred = true;
      } else {
        pullError = err instanceof Error ? err.message : String(err);
      }
    }

    const pending = await outboxCount();
    store.setPendingCount(pending);

    if (pullError) {
      console.error('[nordly:sync]', pullError);
      store.setLastError(pullError);
      return;
    }

    if (pushError) {
      store.setLastError(pushError);
      return;
    }

    if (exhausted > 0) {
      const msg =
        exhausted === 1
          ? `Sync paused — one change failed after ${MAX_ATTEMPTS} attempts. Tap Retry.`
          : `Sync paused — ${exhausted} changes failed after ${MAX_ATTEMPTS} attempts. Tap Retry.`;
      store.setLastError(msg);
      return;
    }

    if (deferred) {
      store.setLastError(null);
      store.setStatus('idle');
      return;
    }

    store.setLastSyncedAt(Date.now());
    store.setStatus('idle');
    window.dispatchEvent(new Event(NORDLY_EVENTS.syncChanged));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[nordly:sync]', message, err);
    store.setLastError(message);
    store.setPendingCount(await outboxCount());
  }
}

export function scheduleSync(): void {
  if (!isSyncEnabled()) return;
  if (debounceTimer !== null) window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    debounceTimer = null;
    void enqueueSync();
  }, DEBOUNCE_MS);
}

export function flushSync(): Promise<void> {
  if (debounceTimer !== null) {
    window.clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  return enqueueSync({ explicit: true, retry: true });
}

function syncErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function onOnline(): void {
  useSyncStore.getState().setStatus('idle');
  void flushSync().catch((err: unknown) => {
    useSyncStore.getState().setLastError(syncErrorMessage(err));
  });
}

function onVisible(): void {
  if (document.visibilityState === 'visible') void enqueueSync();
}

function onFocus(): void {
  void enqueueSync();
}

let vaultUnsub: (() => void) | null = null;

export function startSyncEngine(): void {
  if (started) return;
  started = true;
  vaultUnsub = subscribeVault((unlocked) => {
    if (unlocked) scheduleSync();
  });
  window.addEventListener('online', onOnline);
  window.addEventListener('focus', onFocus);
  document.addEventListener('visibilitychange', onVisible);
  intervalId = window.setInterval(() => {
    const s = useSyncStore.getState();
    if (s.pendingCount > 0 || s.status === 'error') void enqueueSync();
    else if (isSyncEnabled()) void enqueueSync();
  }, INTERVAL_MS);
  void enqueueSync();
}

export function stopSyncEngine(): void {
  if (!started) return;
  started = false;
  vaultUnsub?.();
  vaultUnsub = null;
  window.removeEventListener('online', onOnline);
  window.removeEventListener('focus', onFocus);
  document.removeEventListener('visibilitychange', onVisible);
  if (intervalId !== null) window.clearInterval(intervalId);
  intervalId = null;
  if (debounceTimer !== null) window.clearTimeout(debounceTimer);
  debounceTimer = null;
  syncTail = Promise.resolve();
  useSyncStore.getState().setStatus('idle');
  useSyncStore.getState().setPendingCount(0);
}

export function syncNow(options?: SyncOptions): Promise<void> {
  return enqueueSync(options);
}
