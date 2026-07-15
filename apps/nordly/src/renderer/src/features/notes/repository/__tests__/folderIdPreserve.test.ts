import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, unknown>();

vi.mock('@shared/db/nordlyDb', () => ({
  requireUserId: () => 'user-1',
  entityKey: (id: string, userId: string) => `${userId}::${id}`,
  dbGet: async (_store: string, key: string) => store.get(key) ?? null,
  dbPut: async (_store: string, row: { key: string }) => {
    store.set(row.key, row);
  },
  dbDelete: async (_store: string, key: string) => {
    store.delete(key);
  },
  dbGetAllByUser: async () => [...store.values()],
}));

vi.mock('@shared/crypto/vault', () => ({
  isVaultUnlocked: () => false,
}));

vi.mock('@shared/crypto/vaultPrefs', () => ({
  isVaultEnabledSync: () => false,
}));

vi.mock('@shared/sync/idMap', () => ({
  getServerId: async () => null,
  setServerId: async () => undefined,
}));

vi.mock('../foldersStore', () => ({
  foldersStoreList: async () => [{ id: 'folder-c', name: 'C', createdAt: '', updatedAt: '' }],
}));

import {
  notesStoreMergeRemote,
  notesStoreReplaceId,
  notesStoreSetFolderId,
  type StoredNote,
} from '../notesStore';

function localRow(partial: Partial<StoredNote> & Pick<StoredNote, 'id'>): StoredNote {
  return {
    userId: 'user-1',
    key: `user-1::${partial.id}`,
    title: 'T',
    bodyMd: 'B',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deleted: false,
    ...partial,
  };
}

describe('note folderId device-only preserve', () => {
  beforeEach(() => {
    store.clear();
  });

  it('keeps local folderId when merging a newer remote row', async () => {
    store.set(
      'user-1::n1',
      localRow({
        id: 'n1',
        folderId: 'folder-a',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    );

    await notesStoreMergeRemote(
      localRow({
        id: 'n1',
        title: 'Remote title',
        bodyMd: 'Remote body',
        folderId: null,
        updatedAt: '2026-01-02T00:00:00.000Z',
      }),
    );

    const row = store.get('user-1::n1') as StoredNote;
    expect(row.title).toBe('Remote title');
    expect(row.folderId).toBe('folder-a');
  });

  it('keeps folderId when replacing local id after sync create', async () => {
    store.set(
      'user-1::local-1',
      localRow({ id: 'local-1', folderId: 'folder-b' }),
    );

    await notesStoreReplaceId('local-1', {
      id: 'server-1',
      title: 'T',
      bodyMd: 'B',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      sizeBytes: 1,
    });

    expect(store.has('user-1::local-1')).toBe(false);
    const row = store.get('user-1::server-1') as StoredNote;
    expect(row.folderId).toBe('folder-b');
  });

  it('does not replace a tombstone after a remote create completes', async () => {
    store.set(
      'user-1::local-deleted',
      localRow({ id: 'local-deleted', deleted: true }),
    );

    await notesStoreReplaceId('local-deleted', {
      id: 'server-created',
      title: 'T',
      bodyMd: 'B',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      sizeBytes: 1,
    });

    expect((store.get('user-1::local-deleted') as StoredNote).deleted).toBe(true);
    expect(store.has('user-1::server-created')).toBe(false);
  });

  it('setFolderId does not bump updatedAt', async () => {
    store.set(
      'user-1::n1',
      localRow({
        id: 'n1',
        updatedAt: '2026-01-01T00:00:00.000Z',
        folderId: null,
      }),
    );

    await notesStoreSetFolderId('n1', 'folder-c');
    const row = store.get('user-1::n1') as StoredNote;
    expect(row.folderId).toBe('folder-c');
    expect(row.updatedAt).toBe('2026-01-01T00:00:00.000Z');
  });
});
