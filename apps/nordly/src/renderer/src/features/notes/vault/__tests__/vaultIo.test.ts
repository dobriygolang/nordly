import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VaultNoteContent } from '../types';

const ipc = vi.hoisted(() => ({
  vaultCreateFolder: vi.fn(),
  vaultCreateNote: vi.fn(),
  vaultListFolders: vi.fn(),
  vaultListNotes: vi.fn(),
  vaultMoveFolder: vi.fn(),
  vaultMoveNote: vi.fn(),
  vaultReadNote: vi.fn(),
  vaultRenameFolder: vi.fn(),
  vaultRenameNote: vi.fn(),
  vaultTrashFolder: vi.fn(),
  vaultTrashNote: vi.fn(),
  vaultWriteNote: vi.fn(),
}));

const outbox = vi.hoisted(() => ({
  enqueueVaultFileDelete: vi.fn(),
  enqueueVaultFilePut: vi.fn(),
  remapVaultPath: (path: string, fromPath: string, toPath: string) =>
    path === fromPath
      ? toPath
      : path.startsWith(`${fromPath}/`)
        ? `${toPath}/${path.slice(fromPath.length + 1)}`
        : path,
  suppressVaultWatch: vi.fn(),
}));

vi.mock('@features/notes/vault/ipc', () => ipc);
vi.mock('@features/notes/vault/vaultOutbox', () => outbox);

import { vaultIoRenameFolder, vaultIoUpdateNote } from '../vaultIo';

function note(
  path: string,
  title: string,
  bodyMd: string,
): VaultNoteContent {
  return {
    path,
    title,
    bodyMd,
    folderPath: null,
    updatedAtMs: 1,
    sizeBytes: bodyMd.length,
  };
}

describe('vaultIo writer safety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    outbox.enqueueVaultFileDelete.mockResolvedValue(undefined);
    outbox.enqueueVaultFilePut.mockResolvedValue(undefined);
  });

  it('does not rename when writing the latest body fails', async () => {
    ipc.vaultReadNote.mockResolvedValue(note('Old.md', 'Old', 'old body'));
    ipc.vaultWriteNote.mockRejectedValue(new Error('write failed'));

    await expect(vaultIoUpdateNote('Old.md', 'New', 'latest body')).rejects.toThrow(
      'write failed',
    );
    expect(ipc.vaultRenameNote).not.toHaveBeenCalled();
  });

  it('writes the latest body before a rename that may fail', async () => {
    ipc.vaultReadNote.mockResolvedValue(note('Old.md', 'Old', 'old body'));
    ipc.vaultWriteNote.mockResolvedValue(note('Old.md', 'Old', 'latest body'));
    ipc.vaultRenameNote.mockRejectedValue(new Error('rename failed'));

    await expect(vaultIoUpdateNote('Old.md', 'New', 'latest body')).rejects.toThrow(
      'rename failed',
    );
    expect(ipc.vaultWriteNote).toHaveBeenCalledWith('Old.md', 'latest body');
    expect(ipc.vaultWriteNote.mock.invocationCallOrder[0]).toBeLessThan(
      ipc.vaultRenameNote.mock.invocationCallOrder[0]!,
    );
  });

  it('serializes concurrent writers', async () => {
    let releaseFirst!: (value: VaultNoteContent) => void;
    const firstWrite = new Promise<VaultNoteContent>((resolve) => {
      releaseFirst = resolve;
    });
    ipc.vaultReadNote.mockResolvedValue(note('Note.md', 'Note', 'old'));
    ipc.vaultWriteNote
      .mockReturnValueOnce(firstWrite)
      .mockResolvedValueOnce(note('Note.md', 'Note', 'second'));

    const first = vaultIoUpdateNote('Note.md', 'Note', 'first');
    await vi.waitFor(() => expect(ipc.vaultWriteNote).toHaveBeenCalledTimes(1));
    const second = vaultIoUpdateNote('Note.md', 'Note', 'second');
    await Promise.resolve();
    expect(ipc.vaultReadNote).toHaveBeenCalledTimes(1);

    releaseFirst(note('Note.md', 'Note', 'first'));
    await expect(first).resolves.toMatchObject({ bodyMd: 'first' });
    await expect(second).resolves.toMatchObject({ bodyMd: 'second' });
    expect(ipc.vaultWriteNote).toHaveBeenCalledTimes(2);
  });

  it('remaps a queued writer after a folder path mutation', async () => {
    let releaseRename!: (value: {
      path: string;
      name: string;
      parentPath: string | null;
    }) => void;
    const renameResult = new Promise<{
      path: string;
      name: string;
      parentPath: string | null;
    }>((resolve) => {
      releaseRename = resolve;
    });
    ipc.vaultRenameFolder.mockReturnValue(renameResult);
    ipc.vaultReadNote.mockResolvedValue(
      note('Renamed/Note.md', 'Note', 'old'),
    );
    ipc.vaultWriteNote.mockResolvedValue(
      note('Renamed/Note.md', 'Note', 'latest'),
    );

    const rename = vaultIoRenameFolder('Folder', 'Renamed');
    await vi.waitFor(() => expect(ipc.vaultRenameFolder).toHaveBeenCalled());
    const write = vaultIoUpdateNote('Folder/Note.md', 'Note', 'latest');
    releaseRename({ path: 'Renamed', name: 'Renamed', parentPath: null });

    await expect(rename).resolves.toMatchObject({
      fromPath: 'Folder',
      toPath: 'Renamed',
    });
    await expect(write).resolves.toMatchObject({ id: 'Renamed/Note.md' });
    expect(ipc.vaultReadNote).toHaveBeenCalledWith('Renamed/Note.md');
  });

  it('records a renamed file put before deleting its old outbox path', async () => {
    ipc.vaultReadNote.mockResolvedValue(note('Old.md', 'Old', 'old body'));
    ipc.vaultWriteNote.mockResolvedValue(note('Old.md', 'Old', 'latest body'));
    ipc.vaultRenameNote.mockResolvedValue(note('New.md', 'New', 'latest body'));
    outbox.enqueueVaultFilePut.mockRejectedValueOnce(new Error('put failed'));

    await expect(vaultIoUpdateNote('Old.md', 'New', 'latest body')).rejects.toThrow(
      'put failed',
    );
    expect(outbox.enqueueVaultFilePut).toHaveBeenCalledWith(
      'New.md',
      'latest body',
      'md',
      1,
    );
    expect(outbox.enqueueVaultFileDelete).not.toHaveBeenCalled();
  });
});
