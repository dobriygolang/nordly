import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotesCloudOperation } from '@features/notes/lib/notesCloudPolicy';
import { OutboxOp, SyncDomain, type OutboxEntry } from '@shared/sync/types';

const vaultGetConfig = vi.hoisted(() => vi.fn());
const outbox = vi.hoisted(() => ({
  hasOutboxForEntity: vi.fn(),
  removeOutbox: vi.fn(),
  removeOutboxForEntity: vi.fn(),
}));

vi.mock('@features/notes/vault/ipc', () => ({
  vaultGetConfig,
}));
vi.mock('@shared/sync/outbox', async () => ({
  ...(await vi.importActual<typeof import('@shared/sync/outbox')>(
    '@shared/sync/outbox',
  )),
  ...outbox,
}));

import { pullNotes, pushAllNotesEncrypted, pushNotesOutbox } from '../notesSync';

describe('filesystem-vault notes sync policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vaultGetConfig.mockResolvedValue({
      root: '/vault',
      attachmentFolder: 'img',
      migratedFromIdb: true,
    });
  });

  it('blocks push without consuming an existing IndexedDB outbox entry', async () => {
    const entry = {
      id: 'old-outbox-entry',
      domain: SyncDomain.Notes,
      op: OutboxOp.Update,
    } as OutboxEntry;

    await expect(pushNotesOutbox(entry)).rejects.toMatchObject({
      name: 'NotesCloudCapabilityError',
      operation: NotesCloudOperation.SyncPush,
    });
    expect(outbox.removeOutbox).not.toHaveBeenCalled();
    expect(outbox.removeOutboxForEntity).not.toHaveBeenCalled();
  });

  it('blocks pull before reading the shadow IndexedDB notes store', async () => {
    await expect(pullNotes()).rejects.toMatchObject({
      name: 'NotesCloudCapabilityError',
      operation: NotesCloudOperation.SyncPull,
    });
  });

  it('blocks encrypted bulk push before reading shadow IndexedDB notes', async () => {
    await expect(pushAllNotesEncrypted()).rejects.toMatchObject({
      name: 'NotesCloudCapabilityError',
      operation: NotesCloudOperation.SyncPush,
    });
  });
});
