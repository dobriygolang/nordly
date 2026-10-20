import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SyncDeferredError } from '@shared/sync/errors';
import { OutboxOp, SyncDomain, type OutboxEntry } from '@shared/sync/types';

const vaultGetConfig = vi.hoisted(() => vi.fn());
const consent = vi.hoisted(() => ({
  isNotesSyncEnabled: vi.fn(() => false),
}));
const outbox = vi.hoisted(() => ({
  hasOutboxForEntity: vi.fn(),
  removeOutbox: vi.fn(),
  removeOutboxForEntity: vi.fn(),
}));

vi.mock('@features/notes/vault/ipc', () => ({
  vaultGetConfig,
}));
vi.mock('@features/notes/lib/notesSyncConsent', () => consent);
vi.mock('@shared/sync/outbox', async () => ({
  ...(await vi.importActual<typeof import('@shared/sync/outbox')>(
    '@shared/sync/outbox',
  )),
  ...outbox,
}));

import { pullNotes, pushAllNotesEncrypted, pushNotesOutbox } from '../notesSync';

describe('notes sync while a filesystem vault is bound', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vaultGetConfig.mockResolvedValue({
      root: '/vault',
      attachmentFolder: 'img',
      migratedFromIdb: true,
    });
    outbox.removeOutbox.mockResolvedValue(undefined);
  });

  it('drops an IndexedDB outbox entry without uploading the shadow store', async () => {
    const entry = {
      id: 'old-outbox-entry',
      domain: SyncDomain.Notes,
      op: OutboxOp.Update,
    } as OutboxEntry;

    await expect(pushNotesOutbox(entry)).resolves.toBeUndefined();
    expect(outbox.removeOutbox).toHaveBeenCalledWith('old-outbox-entry');
    expect(outbox.removeOutboxForEntity).not.toHaveBeenCalled();
  });

  it('skips pull before reading the shadow IndexedDB notes store', async () => {
    await expect(pullNotes()).resolves.toBeUndefined();
  });

  it('skips encrypted bulk push before reading shadow IndexedDB notes', async () => {
    await expect(pushAllNotesEncrypted()).resolves.toBeUndefined();
  });
});

describe('IndexedDB notes sync consent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vaultGetConfig.mockResolvedValue(null);
    consent.isNotesSyncEnabled.mockReturnValue(false);
  });

  it('defers a push until notes sync is turned on', async () => {
    const entry = {
      id: 'idb-entry',
      domain: SyncDomain.Notes,
      op: OutboxOp.Update,
    } as OutboxEntry;

    await expect(pushNotesOutbox(entry)).rejects.toBeInstanceOf(SyncDeferredError);
    expect(outbox.removeOutbox).not.toHaveBeenCalled();
  });
});
