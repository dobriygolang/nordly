import { pullFocus, pushFocusOutbox, reconcileFocusOutbox } from '@features/focus/sync/focusSync';
import { pullNotes, pushNotesOutbox } from '@features/notes/sync/notesSync';
import { pushVaultOutbox } from '@features/notes/vault';
import { pullTasks, pushTasksOutbox, reconcileTasksOutbox } from '@features/tasks/sync/tasksSync';
import { registerSyncHandlers } from '@shared/sync/registry';

/** Wire feature sync adapters into shared SyncEngine (call once at bootstrap). */
export function installSyncRegistry(): void {
  registerSyncHandlers({
    pushNotesOutbox,
    pushTasksOutbox,
    pushFocusOutbox,
    pushVaultOutbox: async () => {
      await pushVaultOutbox();
    },
    pullNotes,
    pullTasks,
    pullFocus,
    pullVault: async () => {
      // Stub until ListVaultFiles / GetVaultFile exist on notes service.
    },
    reconcileOutbox: async () => {
      await reconcileTasksOutbox();
      await reconcileFocusOutbox();
    },
  });
}
