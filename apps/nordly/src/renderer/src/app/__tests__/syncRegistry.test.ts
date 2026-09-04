import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getNotesCloudCapability: vi.fn(),
  pullNotes: vi.fn(),
  pushNotesOutbox: vi.fn(),
}));

vi.mock('@features/notes/api/notesCapabilities', () => ({
  getNotesCloudCapability: mocks.getNotesCloudCapability,
}));
vi.mock('@features/notes/sync/notesSync', () => ({
  pullNotes: mocks.pullNotes,
  pushNotesOutbox: mocks.pushNotesOutbox,
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

import {
  pullNotesWhenAvailable,
  pushNotesWhenAvailable,
} from '@app/syncRegistry';
import { OutboxOp, SyncDomain, type OutboxEntry } from '@shared/sync/types';

const ENTRY: OutboxEntry = {
  id: 'outbox-1',
  userId: 'user-1',
  domain: SyncDomain.Notes,
  op: OutboxOp.Update,
  entityId: 'note-1',
  payload: { title: 'Note', bodyMd: '', wikiLinks: [] },
  createdAt: 1,
  attempts: 0,
};

describe('notes sync registry capability gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defers pushes and skips pulls while the filesystem vault is active', async () => {
    mocks.getNotesCloudCapability.mockResolvedValue({
      available: false,
      reason: 'filesystem_vault_cloud_unavailable',
      message: 'Filesystem vault cloud operations are disabled',
    });

    await expect(pushNotesWhenAvailable(ENTRY)).rejects.toMatchObject({
      name: 'SyncDeferredError',
    });
    await expect(pullNotesWhenAvailable()).resolves.toBeUndefined();
    expect(mocks.pushNotesOutbox).not.toHaveBeenCalled();
    expect(mocks.pullNotes).not.toHaveBeenCalled();
  });

  it('delegates both operations for IndexedDB notes', async () => {
    mocks.getNotesCloudCapability.mockResolvedValue({
      available: true,
      reason: null,
      message: null,
    });

    await pushNotesWhenAvailable(ENTRY);
    await pullNotesWhenAvailable();
    expect(mocks.pushNotesOutbox).toHaveBeenCalledWith(ENTRY);
    expect(mocks.pullNotes).toHaveBeenCalledOnce();
  });
});
