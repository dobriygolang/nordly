import { ensureAccessTokenForSync } from '@shared/api/authSession';
import { HEALTH_CHECK_URL } from '@shared/api/config';
import { ensureDevice, getDeviceId } from '@shared/api/device';
import { apiFetch } from '@shared/api/http';
import { DeviceRegisterError, registerSyncDevice } from '@shared/api/registerSyncDevice';
import { getDbUserId } from '@shared/db/nordlyDb';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { readAppVersion } from '@shared/lib/updater';
import { useFeatureUsageStore } from '@shared/model/featureUsage';
import { useSyncStore } from '@shared/model/sync';
import {
  pullAllDomains,
  pushOutboxEntry,
  reconcileDomainOutbox,
} from '@shared/sync/domainHandlers';
import { isSyncDeferredError, SyncError } from '@shared/sync/errors';
import type { SyncOptions } from '@shared/sync/options';
import {
  bumpOutboxAttempts,
  listOutbox,
  outboxCount,
  resetOutboxAttempts,
} from '@shared/sync/outbox';
import {
  canReachNetwork,
  canUseLocalApp,
  isCloudEnabled,
  isSyncEnabled,
} from '@shared/sync/syncConfig';
import type { OutboxEntry } from '@shared/sync/types';

const MIN_IDLE_SYNC_GAP_MS = 45_000;
const MAX_ATTEMPTS = 8;

let cachedAppVersion: string | null = null;
let sessionRegisteredVersion: string | null = null;

async function readCachedAppVersion(): Promise<string> {
  if (cachedAppVersion) return cachedAppVersion;
  cachedAppVersion = await readAppVersion();
  return cachedAppVersion;
}

async function probeServer(): Promise<boolean> {
  if (!canReachNetwork()) return false;
  try {
    const response = await apiFetch(HEALTH_CHECK_URL, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5_000),
    });
    return response.status < 500;
  } catch (err) {
    console.warn('[nordly:sync] health probe failed', err);
    return false;
  }
}

async function ensureCloudSyncRegistration(options: SyncOptions | undefined): Promise<boolean> {
  const syncStore = useSyncStore.getState();
  const featureStore = useFeatureUsageStore.getState();
  const knownRegistration = featureStore.deviceRegistration;
  if (knownRegistration && !knownRegistration.cloudSyncEnabled) {
    syncStore.setStatus('idle');
    syncStore.setLastError(null);
    return false;
  }

  try {
    const appVersion = await readCachedAppVersion();
    await ensureDevice({ appVersion });

    const skipDeviceRegister =
      knownRegistration?.cloudSyncEnabled &&
      Boolean(knownRegistration.deviceId) &&
      sessionRegisteredVersion === appVersion;

    const registration = skipDeviceRegister
      ? {
          deviceId: knownRegistration.deviceId,
          devicesRegistered: knownRegistration.devicesRegistered,
          deviceLimit: knownRegistration.deviceLimit,
          cloudSyncEnabled: knownRegistration.cloudSyncEnabled,
        }
      : await registerSyncDevice({ appVersion });

    if (!skipDeviceRegister) {
      sessionRegisteredVersion = appVersion;
      featureStore.setDeviceRegistration({
        deviceId: registration.deviceId,
        devicesRegistered: registration.devicesRegistered,
        deviceLimit: registration.deviceLimit,
        cloudSyncEnabled: registration.cloudSyncEnabled,
      });
    }
    syncStore.setCloudSyncBlocked(false);

    if (!registration.cloudSyncEnabled) {
      syncStore.setStatus('idle');
      syncStore.setLastError(null);
      return false;
    }
    return true;
  } catch (err) {
    if (err instanceof DeviceRegisterError) {
      if (err.code === 'cloud_sync_disabled') {
        const deviceId = getDeviceId();
        if (!deviceId) {
          throw new SyncError('device_register_failed', 'device id missing after cloud_sync_disabled');
        }
        featureStore.setDeviceRegistration({
          deviceId,
          devicesRegistered: 0,
          deviceLimit: 0,
          cloudSyncEnabled: false,
        });
        syncStore.setStatus('idle');
        syncStore.setLastError(null);
        return false;
      }
      syncStore.setCloudSyncBlocked(true, err.code);
      syncStore.setStatus('idle');
      syncStore.setLastError(null);
      if (options?.explicit) throw new SyncError(err.code, err.message);
      return false;
    }

    const message = errorMessage(err);
    syncStore.setLastError(message);
    if (options?.explicit) {
      throw err instanceof Error ? err : new SyncError('device_register_failed', message);
    }
    return false;
  }
}

async function pushQueue(queue: OutboxEntry[]): Promise<{
  deferred: boolean;
  pushError: string | null;
  exhausted: number;
  pushedAny: boolean;
}> {
  let deferred = false;
  let pushError: string | null = null;
  let exhausted = 0;
  let pushedAny = false;

  for (const entry of queue) {
    if (entry.attempts >= MAX_ATTEMPTS) {
      exhausted += 1;
      continue;
    }
    try {
      await pushOutboxEntry(entry);
      pushedAny = true;
    } catch (err) {
      if (isSyncDeferredError(err)) {
        deferred = true;
        continue;
      }
      const attempts = await bumpOutboxAttempts(entry);
      const message = errorMessage(err);
      if (attempts >= MAX_ATTEMPTS) {
        pushError = `Sync failed on ${entry.domain}/${entry.op} (${entry.entityId}) after ${MAX_ATTEMPTS} attempts: ${message}`;
        console.error('[nordly:sync]', pushError, entry);
      } else if (!pushError) {
        pushError = message;
      }
    }
  }
  return { deferred, pushError, exhausted, pushedAny };
}

function exhaustedMessage(queue: OutboxEntry[], exhausted: number): string {
  const stuck = queue.filter((entry) => entry.attempts >= MAX_ATTEMPTS);
  const describe = (entry: OutboxEntry) => `${entry.domain}/${entry.op}`;
  return exhausted === 1
    ? `One change failed after ${MAX_ATTEMPTS} attempts (${describe(stuck[0]!)}). Tap Retry.`
    : `${exhausted} changes failed after ${MAX_ATTEMPTS} attempts (${stuck.map(describe).join(', ')}). Tap Retry.`;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function resetSyncDeviceSession(): void {
  sessionRegisteredVersion = null;
  cachedAppVersion = null;
}

export async function runSync(options?: SyncOptions): Promise<void> {
  if (!isCloudEnabled() || !canUseLocalApp() || !getDbUserId()) return;

  const store = useSyncStore.getState();
  if (!canReachNetwork()) {
    store.setStatus('offline');
    store.setServerReachable(false);
    store.setLastError(null);
    if (options?.explicit) throw new SyncError('no_network', 'No internet connection');
    return;
  }

  const tokenReady = await ensureAccessTokenForSync();
  if (!tokenReady) {
    store.setStatus('offline');
    store.setLastError(null);
    if (options?.explicit) throw new SyncError('session_expired', 'Session expired');
    return;
  }
  if (!isSyncEnabled()) return;

  if (!options?.explicit && !options?.retry && store.pendingCount === 0) {
    const lastSyncedAt = store.lastSyncedAt ?? 0;
    if (lastSyncedAt > 0 && Date.now() - lastSyncedAt < MIN_IDLE_SYNC_GAP_MS) return;
  }

  if (!(await ensureCloudSyncRegistration(options))) return;

  const reachable = await probeServer();
  store.setServerReachable(reachable);
  if (!reachable) {
    store.setStatus('offline');
    store.setLastError(null);
    if (options?.explicit) throw new SyncError('server_unreachable', 'Cannot reach server');
    return;
  }

  if (options?.retry) {
    store.setLastError(null);
    await resetOutboxAttempts();
  }

  store.setStatus('syncing');
  try {
    await reconcileDomainOutbox();
    const queue = await listOutbox();
    store.setPendingCount(queue.length);
    const pushResult = await pushQueue(queue);

    if (pushResult.pushedAny) {
      window.dispatchEvent(new Event(NORDLY_EVENTS.syncChanged));
    }

    let deferred = pushResult.deferred;
    let pullError: string | null = null;
    if (!options?.pushOnly) {
      try {
        await pullAllDomains();
      } catch (err) {
        if (isSyncDeferredError(err)) deferred = true;
        else pullError = errorMessage(err);
      }
    }

    store.setPendingCount(await outboxCount());
    if (pullError) {
      console.error('[nordly:sync]', pullError);
      store.setLastError(pullError);
      if (options?.explicit) throw new Error(pullError);
      return;
    }
    if (pushResult.pushError) {
      store.setLastError(pushResult.pushError);
      if (options?.explicit) throw new Error(pushResult.pushError);
      return;
    }
    if (pushResult.exhausted > 0) {
      const message = exhaustedMessage(queue, pushResult.exhausted);
      store.setLastError(message);
      if (options?.explicit) throw new Error(message);
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
    window.dispatchEvent(new Event(NORDLY_EVENTS.syncChanged));
  } catch (err) {
    const message = errorMessage(err);
    console.error('[nordly:sync]', message, err);
    store.setLastError(message);
    store.setPendingCount(await outboxCount());
    if (options?.explicit) throw err;
  }
}
