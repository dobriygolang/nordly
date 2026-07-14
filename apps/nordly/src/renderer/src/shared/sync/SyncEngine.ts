import { HEALTH_CHECK_URL } from '@shared/api/config';
import { apiFetch } from '@shared/api/http';
import { ensureAccessTokenForSync } from '@shared/api/authSession';
import { ensureDevice, getDeviceId } from '@shared/api/device';
import { DeviceRegisterError, registerSyncDevice } from '@shared/api/registerSyncDevice';
import { useFeatureUsageStore } from '@shared/model/featureUsage';
import { subscribeVault } from '@shared/crypto/vault';
import { getDbUserId } from '@shared/db/nordlyDb';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { readAppVersion } from '@shared/lib/updater';
import { useSyncStore } from '@shared/model/sync';
import { bumpOutboxAttempts, listOutbox, outboxCount, resetOutboxAttempts } from '@shared/sync/outbox';
import { requireSyncHandlers } from '@shared/sync/registry';
import { isSyncDeferredError, SyncError } from '@shared/sync/errors';
import { canReachNetwork, isCloudApiAvailable, isSyncEnabled } from '@shared/sync/syncConfig';
import type { OutboxEntry } from '@shared/sync/types';

type SyncOptions = {
  /** When true, reject if offline instead of silently queueing. */
  explicit?: boolean;
  /** When true, reset outbox attempts and reconcile local unsynced state before push. */
  retry?: boolean;
  /** Push local outbox only — skip remote pull (lighter startup path). */
  pushOnly?: boolean;
};

const DEBOUNCE_MS = 3000;
const INTERVAL_MS = 60_000;
/** Skip idle background pulls if a successful sync finished more recently than this. */
const MIN_IDLE_SYNC_GAP_MS = 45_000;
/** Let the shell paint before the first full sync after engine start. */
const STARTUP_DEFER_MS = 5_000;
/** Ignore focus/visibility sync triggers right after engine start (window show fires both). */
const STARTUP_FOCUS_COOLDOWN_MS = STARTUP_DEFER_MS;
const MAX_ATTEMPTS = 8;

let debounceTimer: number | null = null;
let intervalId: number | null = null;
let startupTimer: number | null = null;
let pushOnlyTimer: number | null = null;
let engineStartedAt = 0;
let started = false;
let cachedAppVersion: string | null = null;
let sessionRegisteredVersion: string | null = null;

type SyncJob = {
  options?: SyncOptions;
  resolve: () => void;
  reject: (err: unknown) => void;
};

let syncQueue: SyncJob[] = [];
let syncDraining = false;
/** Incremented on stop so an in-flight drain does not unlock a new engine session. */
let syncDrainGeneration = 0;

async function readCachedAppVersion(): Promise<string> {
  if (cachedAppVersion) return cachedAppVersion;
  cachedAppVersion = await readAppVersion();
  return cachedAppVersion;
}

function mergeSyncOptions(a?: SyncOptions, b?: SyncOptions): SyncOptions | undefined {
  if (!a) return b;
  if (!b) return a;
  return {
    explicit: a.explicit || b.explicit,
    retry: a.retry || b.retry,
    pushOnly: a.pushOnly && b.pushOnly,
  };
}

function drainSyncQueue(): void {
  if (syncDraining) return;
  syncDraining = true;
  const gen = syncDrainGeneration;
  void (async () => {
    try {
      while (syncQueue.length > 0) {
        if (gen !== syncDrainGeneration) break;
        const batch = syncQueue.splice(0);
        let options: SyncOptions | undefined;
        for (const job of batch) {
          options = mergeSyncOptions(options, job.options);
        }
        try {
          await runSync(options);
          for (const job of batch) job.resolve();
        } catch (err) {
          for (const job of batch) {
            if (job.options?.explicit) job.reject(err);
            else job.resolve();
          }
        }
      }
    } finally {
      if (gen === syncDrainGeneration) {
        syncDraining = false;
        if (syncQueue.length > 0) drainSyncQueue();
      }
    }
  })();
}

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
  return new Promise((resolve, reject) => {
    syncQueue.push({ options, resolve, reject });
    drainSyncQueue();
  });
}

async function runSync(options?: SyncOptions): Promise<void> {
  if (!isCloudApiAvailable() || !getDbUserId()) return;

  const store = useSyncStore.getState();
  if (!options?.explicit && !options?.retry) {
    const pending = store.pendingCount;
    if (pending === 0) {
      const last = store.lastSyncedAt ?? 0;
      if (last > 0 && Date.now() - last < MIN_IDLE_SYNC_GAP_MS) return;
    }
  }

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

  const featureStore = useFeatureUsageStore.getState();
  const knownReg = featureStore.deviceRegistration;
  if (knownReg && !knownReg.cloudSyncEnabled) {
    store.setStatus('idle');
    store.setLastError(null);
    return;
  }

  try {
    const appVersion = await readCachedAppVersion();
    await ensureDevice({ appVersion });

    const skipDeviceRegister =
      knownReg?.cloudSyncEnabled &&
      Boolean(knownReg.deviceId) &&
      sessionRegisteredVersion === appVersion;

    const reg = skipDeviceRegister
      ? {
          deviceId: knownReg!.deviceId,
          devicesRegistered: knownReg!.devicesRegistered,
          deviceLimit: knownReg!.deviceLimit,
          cloudSyncEnabled: knownReg!.cloudSyncEnabled,
        }
      : await registerSyncDevice({ appVersion });

    if (!skipDeviceRegister) {
      sessionRegisteredVersion = appVersion;
      featureStore.setDeviceRegistration({
        deviceId: reg.deviceId,
        devicesRegistered: reg.devicesRegistered,
        deviceLimit: reg.deviceLimit,
        cloudSyncEnabled: reg.cloudSyncEnabled,
      });
    }
    store.setCloudSyncBlocked(false);

    if (!reg.cloudSyncEnabled) {
      store.setStatus('idle');
      store.setLastError(null);
      return;
    }
  } catch (err) {
    if (err instanceof DeviceRegisterError) {
      if (err.code === 'cloud_sync_disabled') {
        const deviceId = getDeviceId();
        featureStore.setDeviceRegistration({
          deviceId: deviceId ?? '',
          devicesRegistered: 0,
          deviceLimit: 0,
          cloudSyncEnabled: false,
        });
        store.setStatus('idle');
        store.setLastError(null);
        return;
      }
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
    let pushedAny = false;

    for (const entry of queue) {
      if (entry.attempts >= MAX_ATTEMPTS) {
        exhausted++;
        continue;
      }
      try {
        await pushEntry(entry);
        pushedAny = true;
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

    // Remap events as soon as creates push — don't wait for pull success.
    if (pushedAny) {
      window.dispatchEvent(new Event(NORDLY_EVENTS.syncChanged));
    }

    let pullError: string | null = null;
    if (!options?.pushOnly) {
      try {
        await pullAll();
      } catch (err) {
        if (isSyncDeferredError(err)) {
          deferred = true;
        } else {
          pullError = err instanceof Error ? err.message : String(err);
        }
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
      const stuck = queue.filter((e) => e.attempts >= MAX_ATTEMPTS);
      const describe = (e: OutboxEntry) => `${e.domain}/${e.op}`;
      const msg =
        exhausted === 1
          ? `One change failed after ${MAX_ATTEMPTS} attempts (${describe(stuck[0]!)}). Tap Retry.`
          : `${exhausted} changes failed after ${MAX_ATTEMPTS} attempts (${stuck.map(describe).join(', ')}). Tap Retry.`;
      store.setLastError(msg);
      return;
    }

    if (deferred) {
      store.setLastError(null);
      store.setStatus('idle');
      return;
    }

    if (options?.pushOnly) {
      store.setStatus('idle');
      return;
    }

    store.setLastSyncedAt(Date.now());
    store.setStatus('idle');
    // Pull may have merged — notify even if we already fired after push.
    window.dispatchEvent(new Event(NORDLY_EVENTS.syncChanged));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[nordly:sync]', message, err);
    store.setLastError(message);
    store.setPendingCount(await outboxCount());
  }
}

export function resetSyncDeviceSession(): void {
  sessionRegisteredVersion = null;
  cachedAppVersion = null;
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

let focusSyncTimer: number | null = null;
const FOCUS_SYNC_DEBOUNCE_MS = DEBOUNCE_MS;

function scheduleFocusSync(): void {
  if (Date.now() - engineStartedAt < STARTUP_FOCUS_COOLDOWN_MS) return;
  if (focusSyncTimer !== null) window.clearTimeout(focusSyncTimer);
  focusSyncTimer = window.setTimeout(() => {
    focusSyncTimer = null;
    void enqueueSync();
  }, FOCUS_SYNC_DEBOUNCE_MS);
}

function onVisible(): void {
  if (document.visibilityState === 'visible') scheduleFocusSync();
}

function onFocus(): void {
  scheduleFocusSync();
}

let vaultUnsub: (() => void) | null = null;

export function startSyncEngine(): void {
  if (started) return;
  started = true;
  engineStartedAt = Date.now();
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

  // Push pending local changes soon; defer the heavy remote pull until the UI settles.
  if (pushOnlyTimer !== null) window.clearTimeout(pushOnlyTimer);
  pushOnlyTimer = window.setTimeout(() => {
    pushOnlyTimer = null;
    if (!started) return;
    void outboxCount().then((pending) => {
      if (!started || pending === 0) return;
      void enqueueSync({ pushOnly: true });
    });
  }, 1_500);

  startupTimer = window.setTimeout(() => {
    startupTimer = null;
    if (!started) return;
    void enqueueSync();
  }, STARTUP_DEFER_MS);
}

export function stopSyncEngine(): void {
  if (!started) return;
  started = false;
  syncDrainGeneration += 1;
  vaultUnsub?.();
  vaultUnsub = null;
  window.removeEventListener('online', onOnline);
  window.removeEventListener('focus', onFocus);
  document.removeEventListener('visibilitychange', onVisible);
  if (intervalId !== null) window.clearInterval(intervalId);
  intervalId = null;
  if (startupTimer !== null) window.clearTimeout(startupTimer);
  startupTimer = null;
  if (pushOnlyTimer !== null) window.clearTimeout(pushOnlyTimer);
  pushOnlyTimer = null;
  engineStartedAt = 0;
  if (debounceTimer !== null) window.clearTimeout(debounceTimer);
  debounceTimer = null;
  if (focusSyncTimer !== null) window.clearTimeout(focusSyncTimer);
  focusSyncTimer = null;
  syncQueue = [];
  syncDraining = false;
  cachedAppVersion = null;
  sessionRegisteredVersion = null;
  useSyncStore.getState().setStatus('idle');
  useSyncStore.getState().setPendingCount(0);
}

export function syncNow(options?: SyncOptions): Promise<void> {
  return enqueueSync(options);
}
