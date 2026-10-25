import { beforeEach, describe, expect, it, vi } from 'vitest';

import { hashVaultText } from '../vaultReconcile';
import { ApiHttpError } from '@shared/api/errors';
import { SyncDeferredError } from '@shared/sync/errors';
import { OutboxOp, SyncDomain, type OutboxEntry } from '@shared/sync/types';

const ipc = vi.hoisted(() => ({
  vaultGetConfig: vi.fn(),
  vaultReadNote: vi.fn(),
  vaultWriteNote: vi.fn(),
  vaultListNotes: vi.fn(async (): Promise<{ path: string; title: string; folderPath: string | null; updatedAtMs: number; sizeBytes: number }[]> => []),
  vaultTrashNote: vi.fn(),
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

const indexStore = vi.hoisted(() => ({
  getVaultSyncIndex: vi.fn(),
  putVaultSyncIndex: vi.fn(),
  deleteVaultSyncIndex: vi.fn(),
  listVaultSyncIndex: vi.fn(async (): Promise<Array<{
    userId: string;
    path: string;
    serverId: string;
    hash: string;
    remoteUpdatedAt: string;
  }>> => []),
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

const consent = vi.hoisted(() => ({
  isNotesSyncEnabled: vi.fn(() => true),
  setVaultRootMissing: vi.fn(),
}));

vi.mock('@features/notes/lib/notesSyncConsent', () => consent);
vi.mock('@features/notes/vault/ipc', () => ipc);
vi.mock('@features/notes/remote/notesRemote', () => remote);
vi.mock('@features/notes/remote/vaultRemote', () => encryptRemote);
vi.mock('@features/notes/repository/vaultSyncIndexStore', () => indexStore);
vi.mock('@shared/sync/outbox', () => outbox);
vi.mock('@shared/crypto/vaultPrefs', () => vaultPrefs);
vi.mock('@shared/crypto/vault', () => cryptoVault);
vi.mock('@shared/db/nordlyDb', () => ({
  requireUserId: () => 'user-1',
}));
vi.mock('../publishSync', () => ({ refreshPublishedContent: vi.fn(async () => undefined) }));
vi.mock('../notesSync', () => ({
  withNotesRemoteMutation: async <T>(fn: () => Promise<T>) => fn(),
}));
vi.mock('@features/notes/vault/vaultOutbox', () => ({
  suppressVaultWatch: vi.fn(),
  enqueueVaultFilePut: vi.fn(),
}));

import { refreshPublishedContent } from '../publishSync';
import { enqueueVaultFilePut } from '@features/notes/vault/vaultOutbox';

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
    consent.isNotesSyncEnabled.mockReturnValue(true);
    vaultPrefs.areVaultPrefsReady.mockReturnValue(true);
    vaultPrefs.isVaultEnabledSync.mockReturnValue(false);
    cryptoVault.isVaultUnlocked.mockReturnValue(false);
    outbox.removeOutbox.mockResolvedValue(undefined);
    indexStore.putVaultSyncIndex.mockResolvedValue(undefined);
    indexStore.deleteVaultSyncIndex.mockResolvedValue(undefined);
    encryptRemote.remoteEncryptNoteBody.mockResolvedValue(undefined);
  });

  it('creates a remote note keyed by vault path', async () => {
    indexStore.getVaultSyncIndex.mockResolvedValue(null);
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
    expect(indexStore.putVaultSyncIndex).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'proj/Hello.md',
        serverId: 'note-1',
        userId: 'user-1',
      }),
    );
    expect(outbox.removeOutbox).toHaveBeenCalledWith('outbox-1', 'user-1');
  });

  it('updates an already mapped vault note', async () => {
    indexStore.getVaultSyncIndex.mockResolvedValue({ serverId: 'note-1' });
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
    expect(refreshPublishedContent).toHaveBeenCalledWith('note-1', 'A.md', 'A.md', 'next');
  });

  it('does not acknowledge a saved private note until its public copy is refreshed', async () => {
    indexStore.getVaultSyncIndex.mockResolvedValue({ serverId: 'note-1' });
    ipc.vaultReadNote.mockResolvedValue({ path: 'A.md', title: 'A', bodyMd: 'next', folderPath: null, updatedAtMs: 11, sizeBytes: 4 });
    remote.remoteUpdateNote.mockResolvedValue({ id: 'note-1', updatedAt: new Date() });
    vi.mocked(refreshPublishedContent).mockRejectedValueOnce(new Error('Public update failed'));
    await expect(pushVaultOutbox(putEntry('A.md'))).rejects.toThrow('Public update failed');
    expect(outbox.removeOutbox).not.toHaveBeenCalled();
    expect(remote.remoteCreateNote).not.toHaveBeenCalled();
  });

  it('deletes the mapped remote note', async () => {
    indexStore.getVaultSyncIndex.mockResolvedValue({ serverId: 'note-9' });
    remote.remoteDeleteNote.mockResolvedValue(undefined);

    await pushVaultOutbox(deleteEntry('Gone.md'));

    expect(remote.remoteDeleteNote).toHaveBeenCalledWith('note-9');
    expect(indexStore.deleteVaultSyncIndex).toHaveBeenCalledWith('user-1', 'Gone.md');
    expect(outbox.removeOutbox).toHaveBeenCalledWith('outbox-2', 'user-1');
  });

  it('treats a missing local file on put as a remote delete', async () => {
    indexStore.getVaultSyncIndex.mockResolvedValue({ serverId: 'note-3' });
    ipc.vaultReadNote.mockRejectedValue(new Error('read note: no such file'));
    remote.remoteDeleteNote.mockResolvedValue(undefined);

    await pushVaultOutbox(putEntry('Missing.md'));

    expect(remote.remoteCreateNote).not.toHaveBeenCalled();
    expect(remote.remoteDeleteNote).toHaveBeenCalledWith('note-3');
  });

  it('does not delete the remote note when a local read fails for another reason', async () => {
    indexStore.getVaultSyncIndex.mockResolvedValue({ serverId: 'note-3' });
    ipc.vaultReadNote.mockRejectedValue(new Error('read note: permission denied'));

    await expect(pushVaultOutbox(putEntry('A.md'))).rejects.toThrow(/permission denied/);

    expect(remote.remoteDeleteNote).not.toHaveBeenCalled();
    expect(outbox.removeOutbox).not.toHaveBeenCalled();
  });

  it('recreates when the mapped remote note is gone', async () => {
    indexStore.getVaultSyncIndex.mockResolvedValue({ serverId: 'stale-id' });
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

    expect(indexStore.deleteVaultSyncIndex).toHaveBeenCalled();
    expect(remote.remoteCreateNote).toHaveBeenCalledWith('A.md', 'body');
  });
});

describe('pullVaultFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consent.isNotesSyncEnabled.mockReturnValue(true);
    vaultPrefs.areVaultPrefsReady.mockReturnValue(true);
    vaultPrefs.isVaultEnabledSync.mockReturnValue(false);
    cryptoVault.isVaultUnlocked.mockReturnValue(false);
    ipc.vaultGetConfig.mockResolvedValue({
      root: '/vault',
      attachmentFolder: 'img',
      migratedFromIdb: true,
    });
    outbox.hasOutboxForEntity.mockResolvedValue(false);
    indexStore.putVaultSyncIndex.mockResolvedValue(undefined);
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
    expect(remote.remoteGetNote).toHaveBeenCalledTimes(1);
    expect(indexStore.putVaultSyncIndex).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'proj/Hello.md',
        serverId: 'note-1',
        userId: 'user-1',
      }),
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

  it('writes a remote note even when a vault put is already queued', async () => {
    remote.remoteListNotes.mockResolvedValue([
      { id: 'note-1', title: 'A.md', updatedAt: new Date(50), sizeBytes: 1 },
    ]);
    remote.remoteGetNote.mockResolvedValue({
      id: 'note-1',
      title: 'A.md',
      bodyMd: 'remote',
      createdAt: new Date(1),
      updatedAt: new Date(50),
      sizeBytes: 6,
      encrypted: false,
    });
    outbox.hasOutboxForEntity.mockImplementation(
      async (_domain: string, _path: string, op: string) => op === OutboxOp.FilePut,
    );

    await pullVaultFiles();

    expect(ipc.vaultWriteNote).toHaveBeenCalledWith('A.md', 'remote');
    expect(remote.remoteGetNote).toHaveBeenCalledTimes(1);
  });

  it('maps an already-current local file without rewriting', async () => {
    remote.remoteListNotes.mockResolvedValue([
      { id: 'note-1', title: 'A.md', updatedAt: new Date(10), sizeBytes: 4 },
    ]);
    remote.remoteGetNote.mockResolvedValue({
      id: 'note-1',
      title: 'A.md',
      bodyMd: 'same',
      createdAt: new Date(1),
      updatedAt: new Date(10),
      sizeBytes: 4,
      encrypted: false,
    });
    ipc.vaultListNotes.mockResolvedValue([
      { path: 'A.md', title: 'A', folderPath: null, updatedAtMs: 10, sizeBytes: 4 },
    ]);
    ipc.vaultReadNote.mockResolvedValue({
      path: 'A.md',
      title: 'A',
      bodyMd: 'same',
      folderPath: null,
      updatedAtMs: 10,
      sizeBytes: 4,
    });

    await pullVaultFiles();

    expect(ipc.vaultWriteNote).not.toHaveBeenCalled();
    expect(indexStore.putVaultSyncIndex).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'A.md', serverId: 'note-1', userId: 'user-1' }),
    );
  });

  it('does not overwrite a newer local file', async () => {
    remote.remoteListNotes.mockResolvedValue([
      { id: 'note-1', title: 'A.md', updatedAt: new Date(10), sizeBytes: 4 },
    ]);
    remote.remoteGetNote.mockResolvedValue({
      id: 'note-1',
      title: 'A.md',
      bodyMd: 'older-remote',
      createdAt: new Date(1),
      updatedAt: new Date(10),
      sizeBytes: 12,
      encrypted: false,
    });
    ipc.vaultListNotes.mockResolvedValue([
      { path: 'A.md', title: 'A', folderPath: null, updatedAtMs: 50, sizeBytes: 11 },
    ]);
    ipc.vaultReadNote.mockResolvedValue({
      path: 'A.md',
      title: 'A',
      bodyMd: 'newer-local',
      folderPath: null,
      updatedAtMs: 50,
      sizeBytes: 11,
    });

    await pullVaultFiles();

    expect(ipc.vaultWriteNote).toHaveBeenCalledWith(
      expect.stringContaining('конфликт'),
      'older-remote',
    );
    expect(ipc.vaultWriteNote).not.toHaveBeenCalledWith('A.md', 'older-remote');
    expect(indexStore.putVaultSyncIndex).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'A.md', serverId: 'note-1', userId: 'user-1' }),
    );
    expect(enqueueVaultFilePut).toHaveBeenCalledWith('A.md', 'newer-local', 'md', 50);
    expect(enqueueVaultFilePut).toHaveBeenCalledWith(
      expect.stringContaining('конфликт'),
      'older-remote',
      'md',
      new Date(10).getTime(),
    );
  });

  it('does not overwrite an existing same-day conflict copy', async () => {
    const existing = `A (конфликт ${new Date(10).toISOString().slice(0, 10)}).md`;
    indexStore.listVaultSyncIndex.mockResolvedValueOnce([
      {
        userId: 'user-1',
        path: 'A.md',
        serverId: 'note-1',
        hash: 'old',
        remoteUpdatedAt: new Date(1).toISOString(),
      },
    ]);
    remote.remoteListNotes.mockResolvedValue([
      { id: 'note-1', title: 'A.md', updatedAt: new Date(10), sizeBytes: 4 },
    ]);
    remote.remoteGetNote.mockResolvedValue({
      id: 'note-1',
      title: 'A.md',
      bodyMd: 'remote-new',
      createdAt: new Date(1),
      updatedAt: new Date(10),
      sizeBytes: 10,
      encrypted: false,
    });
    ipc.vaultListNotes.mockResolvedValue([
      { path: 'A.md', title: 'A', folderPath: null, updatedAtMs: 50, sizeBytes: 9 },
      { path: existing, title: 'A', folderPath: null, updatedAtMs: 40, sizeBytes: 8 },
    ]);
    ipc.vaultReadNote.mockImplementation(async (path: string) => ({
      path,
      title: 'A',
      bodyMd: path === 'A.md' ? 'local-new' : 'previous-conflict',
      folderPath: null,
      updatedAtMs: 50,
      sizeBytes: 9,
    }));

    await pullVaultFiles();

    expect(ipc.vaultWriteNote).toHaveBeenCalledWith(
      `A (конфликт ${new Date(10).toISOString().slice(0, 10)}) 2.md`,
      'remote-new',
    );
    expect(ipc.vaultWriteNote).not.toHaveBeenCalledWith(existing, 'remote-new');
  });

  it('does not pull over a file edited during reconcile', async () => {
    indexStore.listVaultSyncIndex.mockResolvedValueOnce([
      {
        userId: 'user-1',
        path: 'A.md',
        serverId: 'note-1',
        hash: await hashVaultText('same'),
        remoteUpdatedAt: new Date(1).toISOString(),
      },
    ]);
    remote.remoteListNotes.mockResolvedValue([
      { id: 'note-1', title: 'A.md', updatedAt: new Date(50), sizeBytes: 4 },
    ]);
    remote.remoteGetNote.mockResolvedValue({
      id: 'note-1',
      title: 'A.md',
      bodyMd: 'from-server',
      createdAt: new Date(1),
      updatedAt: new Date(50),
      sizeBytes: 11,
      encrypted: false,
    });
    ipc.vaultListNotes.mockResolvedValue([
      { path: 'A.md', title: 'A', folderPath: null, updatedAtMs: 10, sizeBytes: 4 },
    ]);
    ipc.vaultReadNote
      .mockResolvedValueOnce({
        path: 'A.md',
        title: 'A',
        bodyMd: 'same',
        folderPath: null,
        updatedAtMs: 10,
        sizeBytes: 4,
      })
      .mockResolvedValueOnce({
        path: 'A.md',
        title: 'A',
        bodyMd: 'edited-during-sync',
        folderPath: null,
        updatedAtMs: 60,
        sizeBytes: 18,
      });

    await pullVaultFiles();

    expect(ipc.vaultWriteNote).not.toHaveBeenCalled();
  });

  it('skips pull when no vault folder is bound', async () => {
    ipc.vaultGetConfig.mockResolvedValue(null);
    await pullVaultFiles();
    expect(remote.remoteListNotes).not.toHaveBeenCalled();
  });

  it('does not call the network when notes sync is off', async () => {
    consent.isNotesSyncEnabled.mockReturnValue(false);
    await pullVaultFiles();
    expect(remote.remoteListNotes).not.toHaveBeenCalled();
    await expect(pushVaultOutbox(putEntry('A.md'))).rejects.toBeInstanceOf(SyncDeferredError);
    expect(remote.remoteCreateNote).not.toHaveBeenCalled();
  });

  it('refuses an unencrypted remote note while encryption is on', async () => {
    vaultPrefs.isVaultEnabledSync.mockReturnValue(true);
    cryptoVault.isVaultUnlocked.mockReturnValue(true);
    remote.remoteListNotes.mockResolvedValue([
      { id: 'note-1', title: 'A.md', updatedAt: new Date(20), sizeBytes: 4 },
    ]);
    remote.remoteGetNote.mockResolvedValue({
      id: 'note-1',
      title: 'A.md',
      bodyMd: 'plaintext',
      createdAt: new Date(1),
      updatedAt: new Date(20),
      sizeBytes: 9,
      encrypted: false,
    });

    await expect(pullVaultFiles()).rejects.toThrow('notes_sync_plaintext_while_encrypted');
    expect(ipc.vaultWriteNote).not.toHaveBeenCalled();
  });
});
