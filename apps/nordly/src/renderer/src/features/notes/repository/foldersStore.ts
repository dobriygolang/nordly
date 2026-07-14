import { dbGet, dbPut, requireUserId } from '@shared/db/nordlyDb';

export interface NoteFolder {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

function metaKey(userId: string): string {
  return `note_folders::${userId}`;
}

interface FoldersMetaRow {
  key: string;
  userId: string;
  folders: NoteFolder[];
  updatedAt: number;
}

/** Serialize RMW updates per user so parallel create/rename cannot drop writes. */
const writeQueues = new Map<string, Promise<unknown>>();

function enqueueFolderWrite<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const prev = writeQueues.get(userId) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  writeQueues.set(
    userId,
    next.then(
      () => undefined,
      () => undefined,
    ),
  );
  return next;
}

export async function foldersStoreList(userId?: string): Promise<NoteFolder[]> {
  const uid = userId ?? requireUserId();
  const row = await dbGet<FoldersMetaRow>('meta', metaKey(uid));
  return row?.folders ?? [];
}

async function updateFolders(
  userId: string,
  mutate: (folders: NoteFolder[]) => NoteFolder[],
): Promise<NoteFolder[]> {
  return enqueueFolderWrite(userId, async () => {
    const current = await foldersStoreList(userId);
    const next = mutate(current);
    await dbPut('meta', {
      key: metaKey(userId),
      userId,
      folders: next,
      updatedAt: Date.now(),
    } satisfies FoldersMetaRow);
    return next;
  });
}

export async function foldersStoreCreate(name: string, userId?: string): Promise<NoteFolder> {
  const uid = userId ?? requireUserId();
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Folder name is empty');
  const now = new Date().toISOString();
  const folder: NoteFolder = {
    id: crypto.randomUUID(),
    name: trimmed,
    createdAt: now,
    updatedAt: now,
  };
  await updateFolders(uid, (folders) => [...folders, folder]);
  return folder;
}

export async function foldersStoreRename(
  id: string,
  name: string,
  userId?: string,
): Promise<NoteFolder> {
  const uid = userId ?? requireUserId();
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Folder name is empty');
  let updated: NoteFolder | null = null;
  await updateFolders(uid, (folders) => {
    const idx = folders.findIndex((f) => f.id === id);
    if (idx < 0) throw new Error(`Folder not found: ${id}`);
    updated = {
      ...folders[idx],
      name: trimmed,
      updatedAt: new Date().toISOString(),
    };
    const copy = [...folders];
    copy[idx] = updated;
    return copy;
  });
  if (!updated) throw new Error(`Folder not found: ${id}`);
  return updated;
}

export async function foldersStoreDelete(id: string, userId?: string): Promise<void> {
  const uid = userId ?? requireUserId();
  await updateFolders(uid, (list) => {
    if (!list.some((f) => f.id === id)) {
      throw new Error(`Folder not found: ${id}`);
    }
    return list.filter((f) => f.id !== id);
  });
}
