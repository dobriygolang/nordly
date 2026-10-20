import { pullFocus, pushFocusOutbox, reconcileFocusOutbox } from '@features/focus/sync/focusSync';
import { resetGoogleCalendarConnection } from '@features/calendar/lib/googleCalendarConnectionStore';
import { clearNotesSyncConsentCache } from '@features/notes/lib/notesSyncConsent';
import { pullNotes, pushNotesOutbox } from '@features/notes/sync/notesSync';
import { pullVaultFiles, pushVaultOutbox } from '@features/notes/sync/vaultFileSync';
import { pullTasks, pushTasksOutbox, reconcileTasksOutbox } from '@features/tasks/sync/tasksSync';
import { registerUserScopeResetHandler } from '@shared/model/userScopeLifecycle';
import { registerSyncHandlers } from '@shared/sync/registry';

/** Wire feature sync adapters into shared SyncEngine (call once at bootstrap). */
export function installSyncRegistry(): void {
  registerUserScopeResetHandler(resetGoogleCalendarConnection);
  registerUserScopeResetHandler(() => {
    clearNotesSyncConsentCache();
  });
  registerSyncHandlers({
    pushNotesOutbox,
    pushTasksOutbox,
    pushFocusOutbox,
    pushVaultOutbox,
    pullNotes,
    pullTasks,
    pullFocus,
    pullVault: pullVaultFiles,
    reconcileOutbox: async () => {
      await reconcileTasksOutbox();
      await reconcileFocusOutbox();
    },
  });
}
