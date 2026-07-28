import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, unknown>();

vi.mock('@shared/db/nordlyDb', () => ({
  requireUserId: () => 'user-1',
  dbGet: async (_store: string, key: string) => store.get(key) ?? null,
  dbPut: async (_store: string, row: { key: string }) => {
    store.set(row.key, row);
  },
}));

import {
  foldersStoreCreate,
  foldersStoreList,
  foldersStoreMove,
  type NoteFolder,
} from '../foldersStore';

function folderMap(folders: NoteFolder[]): Map<string, NoteFolder> {
  return new Map(folders.map((f) => [f.id, f]));
}

describe('foldersStoreMove', () => {
  beforeEach(() => {
    store.clear();
  });

  it('reparents a folder under another folder', async () => {
    const a = await foldersStoreCreate('A');
    const b = await foldersStoreCreate('B');
    const moved = await foldersStoreMove(a.id, b.id);
    expect(moved.parentId).toBe(b.id);
    const byId = folderMap(await foldersStoreList());
    expect(byId.get(a.id)?.parentId).toBe(b.id);
    expect(byId.get(b.id)?.parentId).toBeNull();
  });

  it('moves a nested folder back to top-level', async () => {
    const root = await foldersStoreCreate('Root');
    const child = await foldersStoreCreate('Child', root.id);
    const moved = await foldersStoreMove(child.id, null);
    expect(moved.parentId).toBeNull();
  });

  it('rejects moving a folder into itself or a descendant', async () => {
    const root = await foldersStoreCreate('Root');
    const child = await foldersStoreCreate('Child', root.id);
    await expect(foldersStoreMove(root.id, root.id)).rejects.toThrow(/itself or a descendant/i);
    await expect(foldersStoreMove(root.id, child.id)).rejects.toThrow(/itself or a descendant/i);
  });

  it('rejects name collision among siblings', async () => {
    const target = await foldersStoreCreate('Target');
    await foldersStoreCreate('Dup', target.id);
    const other = await foldersStoreCreate('Dup');
    await expect(foldersStoreMove(other.id, target.id)).rejects.toThrow(/already exists/i);
  });
});
