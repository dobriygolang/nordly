import { requireSyncHandlers } from '@shared/sync/registry';
import type { OutboxEntry } from '@shared/sync/types';

export async function pushOutboxEntry(entry: OutboxEntry): Promise<void> {
  const handlers = requireSyncHandlers();
  if (entry.domain === 'notes') await handlers.pushNotesOutbox(entry);
  else if (entry.domain === 'tasks') await handlers.pushTasksOutbox(entry);
  else await handlers.pushFocusOutbox(entry);
}

export async function pullAllDomains(): Promise<void> {
  const handlers = requireSyncHandlers();
  await handlers.pullNotes();
  await handlers.pullTasks();
  await handlers.pullFocus();
}

export async function reconcileDomainOutbox(): Promise<void> {
  await requireSyncHandlers().reconcileOutbox();
}
