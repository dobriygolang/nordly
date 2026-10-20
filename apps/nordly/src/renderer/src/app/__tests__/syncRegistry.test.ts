import { describe, expect, it, vi } from 'vitest';

const registerSyncHandlers = vi.hoisted(() => vi.fn());

vi.mock('@features/notes/sync/notesSync', () => ({
  pullNotes: vi.fn(),
  pushNotesOutbox: vi.fn(),
}));
vi.mock('@features/notes/sync/vaultFileSync', () => ({
  pullVaultFiles: vi.fn(),
  pushVaultOutbox: vi.fn(),
}));
vi.mock('@features/notes/lib/notesSyncConsent', () => ({
  clearNotesSyncConsentCache: vi.fn(),
}));
vi.mock('@features/focus/sync/focusSync', () => ({
  pullFocus: vi.fn(),
  pushFocusOutbox: vi.fn(),
  reconcileFocusOutbox: vi.fn(),
}));
vi.mock('@features/tasks/sync/tasksSync', () => ({
  pullTasks: vi.fn(),
  pushTasksOutbox: vi.fn(),
  reconcileTasksOutbox: vi.fn(),
}));
vi.mock('@features/calendar/lib/googleCalendarConnectionStore', () => ({
  resetGoogleCalendarConnection: vi.fn(),
}));
vi.mock('@shared/model/userScopeLifecycle', () => ({
  registerUserScopeResetHandler: vi.fn(),
}));
vi.mock('@shared/sync/registry', () => ({
  registerSyncHandlers,
}));

import { installSyncRegistry } from '@app/syncRegistry';

describe('installSyncRegistry', () => {
  it('wires notes and vault handlers directly', () => {
    installSyncRegistry();
    expect(registerSyncHandlers).toHaveBeenCalledWith(
      expect.objectContaining({
        pushNotesOutbox: expect.any(Function),
        pullNotes: expect.any(Function),
        pushVaultOutbox: expect.any(Function),
        pullVault: expect.any(Function),
      }),
    );
  });
});
