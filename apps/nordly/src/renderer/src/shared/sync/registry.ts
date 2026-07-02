import type { OutboxEntry } from '@shared/sync/types';

export interface SyncDomainHandlers {
  pushNotesOutbox: (entry: OutboxEntry) => Promise<void>;
  pushTasksOutbox: (entry: OutboxEntry) => Promise<void>;
  pushFocusOutbox: (entry: OutboxEntry) => Promise<void>;
  pullNotes: () => Promise<void>;
  pullTasks: () => Promise<void>;
  pullFocus: () => Promise<void>;
  reconcileOutbox: () => Promise<void>;
}

let handlers: SyncDomainHandlers | null = null;

export function registerSyncHandlers(next: SyncDomainHandlers): void {
  if (handlers) {
    throw new Error('Sync handlers already registered');
  }
  handlers = next;
}

export function requireSyncHandlers(): SyncDomainHandlers {
  if (!handlers) {
    throw new Error('Sync handlers not registered — call installSyncRegistry() at app bootstrap');
  }
  return handlers;
}
