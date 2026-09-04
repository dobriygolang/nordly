import { pullFocus, pushFocusOutbox, reconcileFocusOutbox } from '@features/focus/sync/focusSync';
import { resetGoogleCalendarConnection } from '@features/calendar/lib/googleCalendarConnectionStore';
import { getNotesCloudCapability } from '@features/notes/api/notesCapabilities';
import { pullNotes, pushNotesOutbox } from '@features/notes/sync/notesSync';
import { pullVaultFiles, pushVaultOutbox } from '@features/notes/sync/vaultFileSync';
import { pullTasks, pushTasksOutbox, reconcileTasksOutbox } from '@features/tasks/sync/tasksSync';
import { registerUserScopeResetHandler } from '@shared/model/userScopeLifecycle';
import { SyncDeferredError } from '@shared/sync/errors';
import { registerSyncHandlers } from '@shared/sync/registry';
import type { OutboxEntry } from '@shared/sync/types';

export async function pushNotesWhenAvailable(entry: OutboxEntry): Promise<void> {
  const capability = await getNotesCloudCapability();
  if (!capability.available) {
    throw new SyncDeferredError(capability.message);
  }
  await pushNotesOutbox(entry);
}

export async function pullNotesWhenAvailable(): Promise<void> {
  const capability = await getNotesCloudCapability();
  if (!capability.available) return;
  await pullNotes();
}

/** Wire feature sync adapters into shared SyncEngine (call once at bootstrap). */
export function installSyncRegistry(): void {
  registerUserScopeResetHandler(resetGoogleCalendarConnection);
  registerSyncHandlers({
    pushNotesOutbox: pushNotesWhenAvailable,
    pushTasksOutbox,
    pushFocusOutbox,
    pushVaultOutbox,
    pullNotes: pullNotesWhenAvailable,
    pullTasks,
    pullFocus,
    pullVault: pullVaultFiles,
    reconcileOutbox: async () => {
      await reconcileTasksOutbox();
      await reconcileFocusOutbox();
    },
  });
}
