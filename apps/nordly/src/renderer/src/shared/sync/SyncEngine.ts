import { subscribeVault } from '@shared/crypto/vault';
import { useSyncStore } from '@shared/model/sync';
import {
  resetSyncDeviceSession as resetDeviceSession,
  runSync,
} from '@shared/sync/orchestrator';
import type { SyncOptions } from '@shared/sync/options';
import { outboxCount } from '@shared/sync/outbox';
import { requireSyncHandlers } from '@shared/sync/registry';
import {
  browserSyncClock,
  SyncScheduler,
} from '@shared/sync/scheduler';
import { SerialSyncQueue } from '@shared/sync/serialQueue';
import { canUseLocalApp, isCloudEnabled } from '@shared/sync/syncConfig';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const queue = new SerialSyncQueue({
  run: runSync,
  onBatchError: (err) => {
    console.error('[nordly:sync] queued sync failed', err);
    useSyncStore.getState().setLastError(errorMessage(err));
  },
});

let engineStarted = false;

function enqueueBackgroundSync(options: SyncOptions | undefined, source: string): void {
  void queue.enqueue(options).catch((err: unknown) => {
    console.error(`[nordly:sync] ${source} sync failed`, err);
    useSyncStore.getState().setLastError(errorMessage(err));
  });
}

const scheduler = new SyncScheduler({
  clock: browserSyncClock,
  windowTarget: window,
  documentTarget: document,
  isVisible: () => document.visibilityState === 'visible',
  canSchedule: () => isCloudEnabled() && canUseLocalApp(),
  getSyncState: () => useSyncStore.getState(),
  countPending: outboxCount,
  subscribeVault,
  enqueueBackground: enqueueBackgroundSync,
  flushOnline: () => {
    useSyncStore.getState().setStatus('idle');
    void flushSync().catch((err: unknown) => {
      useSyncStore.getState().setLastError(errorMessage(err));
    });
  },
  onSchedulerError: (err, source) => {
    console.error(`[nordly:sync] ${source} failed`, err);
    useSyncStore.getState().setLastError(errorMessage(err));
  },
});

export function resetSyncDeviceSession(): void {
  resetDeviceSession();
}

export function scheduleSync(): void {
  scheduler.schedule();
}

export function flushSync(): Promise<void> {
  scheduler.clearScheduledSync();
  return queue.enqueue({ explicit: true, retry: true });
}

export function startSyncEngine(): void {
  if (engineStarted) return;
  // Bootstrap wiring is required even if the first scheduled run exits at a network gate.
  requireSyncHandlers();
  engineStarted = true;
  scheduler.start();
}

export function stopSyncEngine(): void {
  if (!engineStarted) return;
  engineStarted = false;
  scheduler.stop();
  queue.stopGeneration();
  resetDeviceSession();
  useSyncStore.getState().setStatus('idle');
  useSyncStore.getState().setPendingCount(0);
}

export function syncNow(options?: SyncOptions): Promise<void> {
  return queue.enqueue(options);
}
