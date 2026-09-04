import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiHttpError } from '@shared/api/errors';
import { OutboxOp, SyncDomain, type OutboxEntry } from '@shared/sync/types';

const ipc = vi.hoisted(() => ({
  vaultGetConfig: vi.fn(),
  vaultReadNote: vi.fn(),
  vaultWriteNote: vi.fn(),
}));

const remote = vi.hoisted(() => ({
  remoteCreateNote: vi.fn(),
  remoteDeleteNote: vi.fn(),
  remoteGetNote: vi.fn(),
  remoteListNotes: vi.fn(),
  remoteUpdateNote: vi.fn(),
}));

const encryptRemote = vi.hoisted(() => ({
  remoteEncryptNoteBody: vi.fn(),
}));

const idMap = vi.hoisted(() => ({
  clearServerId: vi.fn(),
  getServerId: vi.fn(),
  setServerId: vi.fn(),
}));

const outbox = vi.hoisted(() => ({
  hasOutboxForEntity: vi.fn(),
  removeOutbox: vi.fn(),
}));

const vaultPrefs = vi.hoisted(() => ({
  areVaultPrefsReady: vi.fn(() => true),
  isVaultEnabledSync: vi.fn(() => false),
}));

const cryptoVault = vi.hoisted(() => ({
  isVaultUnlocked: vi.fn(() => false),
}));

vi.mock('@features/notes/vault/ipc', () => ipc);
vi.mock('@features/notes/remote/notesRemote', () => remote);
vi.mock('@features/notes/remote/vaultRemote', () => encryptRemote);
vi.mock('@shared/sync/idMap', () => idMap);
vi.mock('@shared/sync/outbox', () => outbox);
vi.mock('@shared/crypto/vaultPrefs', () => vaultPrefs);
vi.mock('@shared/crypto/vault', () => cryptoVault);
vi.mock('@shared/db/nordlyDb', () => ({
  requireUserId: () => 'user-1',
}));
vi.mock('../notesSync', () => ({
  withNotesRemoteMutation: async <T>(fn: () => Promise<T>) => fn(),
}));
vi.mock('@features/notes/vault/vaultOutbox', () => ({
  suppressVaultWatch: vi.fn(),
}));

import { isVaultRelPath, pullVaultFiles, pushVaultOutbox } from '../vaultFileSync';

function putEntry(path: string): OutboxEntry {
  return {
    id: 'outbox-1',
    userId: 'user-1',
    domain: SyncDomain.Vault,
    op: OutboxOp.FilePut,
    entityId: path,
    payload: { path, hash: 'abc', mtimeMs: 1, kind: 'md' },
    createdAt: 1,
    attempts: 0,
  };
}

function deleteEntry(path: string): OutboxEntry {
  return {
    id: 'outbox-2',
    userId: 'user-1',
    domain: SyncDomain.Vault,
    op: OutboxOp.FileDelete,
    entityId: path,
    payload: { path },
    createdAt: 1,
    attempts: 0,
  };
}

describe('isVaultRelPath', () => {
  it('accepts nested markdown paths', () => {
    expect(isVaultRelPath('Inbox.md')).toBe(true);
    expect(isVaultRelPath('proj/a.md')).toBe(true);
  });

  it('rejects traversal and non-markdown', () => {
    expect(isVaultRelPath('../secret.md')).toBe(false);
    expect(isVaultRelPath('/abs.md')).toBe(false);
    expect(isVaultRelPath('a\\b.md')).toBe(false);
    expect(isVaultRelPath('img/pic.png')).toBe(false);
  });
});

describe('pushVaultOutbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vaultPrefs.areVaultPrefsReady.mockReturnValue(true);
    vaultPrefs.isVaultEnabledSync.mockReturnValue(false);
    cryptoVault.isVaultUnlocked.mockReturnValue(false);
    outbox.removeOutbox.mockResolvedValue(undefined);
    idMap.setServerId.mockResolvedValue(undefined);
    idMap.clearServerId.mockResolvedValue(undefined);
    encryptRemote.remoteEncryptNoteBody.mockResolvedValue(undefined);
  });

  it('creates a remote note keyed by vault path', async () => {
    idMap.getServerId.mockResolvedValue(null);
    ipc.vaultReadNote.mockResolvedValue({
      path: 'proj/Hello.md',
      title: 'Hello',
      bodyMd: 'hi',
      folderPath: 'proj',
      updatedAtMs: 10,
      sizeBytes: 2,
    });
    remote.remoteCreateNote.mockResolvedValue({
      id: 'note-1',
      title: 'proj/Hello.md',
      bodyMd: 'hi',
      createdAt: new Date(),
      updatedAt: new Date(),
      sizeBytes: 2,
      encrypted: false,
    });

    await pushVaultOutbox(putEntry('proj/Hello.md'));

    expect(remote.remoteCreateNote).toHaveBeenCalledWith('proj/Hello.md', 'hi');
    expect(idMap.setServerId).toHaveBeenCalledWith(
      SyncDomain.Vault,
      'proj/Hello.md',
      'note-1',
      'user-1',
    );
    expect(outbox.removeOutbox).toHaveBeenCalledWith('outbox-1', 'user-1');
  });

  it('updates an already mapped vault note', async () => {
    idMap.getServerId.mockResolvedValue('note-1');
    ipc.vaultReadNote.mockResolvedValue({
      path: 'A.md',
      title: 'A',
      bodyMd: 'next',
      folderPath: null,
      updatedAtMs: 11,
      sizeBytes: 4,
    });
    remote.remoteUpdateNote.mockResolvedValue({
      id: 'note-1',
      title: 'A.md',
      bodyMd: 'next',
      createdAt: new Date(),
      updatedAt: new Date(),
      sizeBytes: 4,
      encrypted: false,
    });

    await pushVaultOutbox(putEntry('A.md'));

    expect(remote.remoteCreateNote).not.toHaveBeenCalled();
    expect(remote.remoteUpdateNote).toHaveBeenCalledWith('note-1', 'A.md', 'next');
  });

  it('deletes the mapped remote note', async () => {
    idMap.getServerId.mockResolvedValue('note-9');
    remote.remoteDeleteNote.mockResolvedValue(undefined);

    await pushVaultOutbox(deleteEntry('Gone.md'));

    expect(remote.remoteDeleteNote).toHaveBeenCalledWith('note-9');
    expect(idMap.clearServerId).toHaveBeenCalledWith(SyncDomain.Vault, 'Gone.md', 'user-1');
    expect(outbox.removeOutbox).toHaveBeenCalledWith('outbox-2', 'user-1');
  });

  it('treats a missing local file on put as a remote delete', async () => {
    idMap.getServerId.mockResolvedValue('note-3');
    ipc.vaultReadNote.mockRejectedValue(new Error('read note: no such file'));
    remote.remoteDeleteNote.mockResolvedValue(undefined);

    await pushVaultOutbox(putEntry('Missing.md'));

    expect(remote.remoteCreateNote).not.toHaveBeenCalled();
    expect(remote.remoteDeleteNote).toHaveBeenCalledWith('note-3');
  });

  it('recreates when the mapped remote note is gone', async () => {
    idMap.getServerId.mockResolvedValueOnce('stale-id').mockResolvedValueOnce(null);
    ipc.vaultReadNote.mockResolvedValue({
      path: 'A.md',
      title: 'A',
      bodyMd: 'body',
      folderPath: null,
      updatedAtMs: 1,
      sizeBytes: 4,
    });
    remote.remoteUpdateNote.mockRejectedValue(new ApiHttpError('updateNote', 404));
    remote.remoteCreateNote.mockResolvedValue({
      id: 'note-new',
      title: 'A.md',
      bodyMd: 'body',
      createdAt: new Date(),
      updatedAt: new Date(),
      sizeBytes: 4,
      encrypted: false,
    });

    await pushVaultOutbox(putEntry('A.md'));

    expect(idMap.clearServerId).toHaveBeenCalled();
    expect(remote.remoteCreateNote).toHaveBeenCalledWith('A.md', 'body');
  });
});

describe('pullVaultFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vaultPrefs.areVaultPrefsReady.mockReturnValue(true);
    vaultPrefs.isVaultEnabledSync.mockReturnValue(false);
    cryptoVault.isVaultUnlocked.mockReturnValue(false);
    ipc.vaultGetConfig.mockResolvedValue({
      root: '/vault',
      attachmentFolder: 'img',
      migratedFromIdb: true,
    });
    outbox.hasOutboxForEntity.mockResolvedValue(false);
    idMap.setServerId.mockResolvedValue(undefined);
  });

  it('writes a newer remote markdown file into the vault', async () => {
    remote.remoteListNotes.mockResolvedValue([
      { id: 'note-1', title: 'proj/Hello.md', updatedAt: new Date(50), sizeBytes: 2 },
    ]);
    remote.remoteGetNote.mockResolvedValue({
      id: 'note-1',
      title: 'proj/Hello.md',
      bodyMd: 'from-server',
      createdAt: new Date(1),
      updatedAt: new Date(50),
      sizeBytes: 11,
      encrypted: false,
    });
    ipc.vaultReadNote.mockRejectedValue(new Error('missing'));
    ipc.vaultWriteNote.mockResolvedValue({
      path: 'proj/Hello.md',
      title: 'Hello',
      bodyMd: 'from-server',
      folderPath: 'proj',
      updatedAtMs: 50,
      sizeBytes: 11,
    });

    await pullVaultFiles();

    expect(ipc.vaultWriteNote).toHaveBeenCalledWith('proj/Hello.md', 'from-server');
    expect(idMap.setServerId).toHaveBeenCalledWith(
      SyncDomain.Vault,
      'proj/Hello.md',
      'note-1',
      'user-1',
    );
  });

  it('skips notes whose titles are not vault paths', async () => {
    remote.remoteListNotes.mockResolvedValue([
      { id: 'note-2', title: 'Meeting', updatedAt: new Date(1), sizeBytes: 1 },
    ]);
    remote.remoteGetNote.mockResolvedValue({
      id: 'note-2',
      title: 'Meeting',
      bodyMd: 'idb leftover',
      createdAt: new Date(1),
      updatedAt: new Date(1),
      sizeBytes: 1,
      encrypted: false,
    });

    await pullVaultFiles();

    expect(ipc.vaultWriteNote).not.toHaveBeenCalled();
  });
});
