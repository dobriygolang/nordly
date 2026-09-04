import { requireSyncHandlers } from '@shared/sync/registry';
import { SyncDomain, type OutboxEntry } from '@shared/sync/types';

export async function pushOutboxEntry(entry: OutboxEntry): Promise<void> {
  const handlers = requireSyncHandlers();
  switch (entry.domain) {
    case SyncDomain.Notes:
      await handlers.pushNotesOutbox(entry);
      return;
    case SyncDomain.Tasks:
      await handlers.pushTasksOutbox(entry);
      return;
    case SyncDomain.Vault:
      await handlers.pushVaultOutbox(entry);
      return;
    case SyncDomain.Focus:
      await handlers.pushFocusOutbox(entry);
      return;
    default:
      throw new Error(
        `Unknown sync domain: ${String((entry as { domain: unknown }).domain)}`,
      );
  }
}

export async function pullAllDomains(): Promise<void> {
  const handlers = requireSyncHandlers();
  await handlers.pullNotes();
  await handlers.pullTasks();
  await handlers.pullFocus();
  await handlers.pullVault();
}

export async function reconcileDomainOutbox(): Promise<void> {
  await requireSyncHandlers().reconcileOutbox();
}
