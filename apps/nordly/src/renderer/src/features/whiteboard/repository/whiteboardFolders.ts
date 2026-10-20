import { dbGet, dbPut, requireUserId } from '@shared/db/nordlyDb';

export interface BoardFolder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}

function metaKey(userId: string): string {
  return `whiteboard_folders::${userId}`;
}

interface FoldersMetaRow {
  key: string;
  userId: string;
  folders: BoardFolder[];
  updatedAt: number;
}

const writeQueues = new Map<string, Promise<unknown>>();

function enqueue<T>(userId: string, fn: () => Promise<T>): Promise<T> {
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

export function boardFolderSubtreeIds(folders: BoardFolder[], rootId: string): string[] {
  const ids = new Set<string>([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const folder of folders) {
      if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
        ids.add(folder.id);
        grew = true;
      }
    }
  }
  return [...ids];
}

export async function boardFoldersList(userId?: string): Promise<BoardFolder[]> {
  const uid = userId ?? requireUserId();
  const row = await dbGet<FoldersMetaRow>('meta', metaKey(uid));
  return row?.folders ?? [];
}

async function saveFolders(userId: string, folders: BoardFolder[]): Promise<void> {
  await dbPut('meta', {
    key: metaKey(userId),
    userId,
    folders,
    updatedAt: Date.now(),
  } satisfies FoldersMetaRow);
}

export async function boardFoldersCreate(name: string, parentId: string | null): Promise<BoardFolder> {
  const clean = name.trim();
  if (!clean) throw new Error('Folder name is required');
  const userId = requireUserId();
  return enqueue(userId, async () => {
    const folders = await boardFoldersList(userId);
    if (parentId && !folders.some((folder) => folder.id === parentId)) {
      throw new Error(`Parent folder not found: ${parentId}`);
    }
    const siblingNames = new Set(
      folders.filter((folder) => folder.parentId === parentId).map((folder) => folder.name),
    );
    let uniqueName = clean;
    if (siblingNames.has(uniqueName)) {
      let n = 1;
      while (siblingNames.has(`${clean} (${n})`)) n += 1;
      uniqueName = `${clean} (${n})`;
    }
    const now = new Date().toISOString();
    const folder: BoardFolder = {
      id: crypto.randomUUID(),
      name: uniqueName,
      parentId,
      createdAt: now,
      updatedAt: now,
    };
    await saveFolders(userId, [...folders, folder]);
    return folder;
  });
}

export async function boardFoldersRename(id: string, name: string): Promise<BoardFolder> {
  const clean = name.trim();
  if (!clean) throw new Error('Folder name is required');
  const userId = requireUserId();
  return enqueue(userId, async () => {
    const folders = await boardFoldersList(userId);
    const current = folders.find((folder) => folder.id === id);
    if (!current) throw new Error(`Folder not found: ${id}`);
    const next = folders.map((folder) =>
      folder.id === id ? { ...folder, name: clean, updatedAt: new Date().toISOString() } : folder,
    );
    await saveFolders(userId, next);
    return next.find((folder) => folder.id === id)!;
  });
}

/** Reparent a folder. Nested folders stay attached; only this folder's parentId changes. */
export async function boardFoldersMove(id: string, parentId: string | null): Promise<BoardFolder> {
  const userId = requireUserId();
  return enqueue(userId, async () => {
    const folders = await boardFoldersList(userId);
    const current = folders.find((folder) => folder.id === id);
    if (!current) throw new Error(`Folder not found: ${id}`);
    if ((current.parentId ?? null) === parentId) return current;
    if (parentId) {
      if (!folders.some((folder) => folder.id === parentId)) {
        throw new Error(`Parent folder not found: ${parentId}`);
      }
      if (boardFolderSubtreeIds(folders, id).includes(parentId)) {
        throw new Error('Cannot move folder into itself or a descendant');
      }
    }
    const nameTaken = folders.some(
      (folder) =>
        folder.id !== id &&
        (folder.parentId ?? null) === parentId &&
        folder.name === current.name,
    );
    if (nameTaken) throw new Error(`Folder already exists: ${current.name}`);
    const next = folders.map((folder) =>
      folder.id === id
        ? { ...folder, parentId, updatedAt: new Date().toISOString() }
        : folder,
    );
    await saveFolders(userId, next);
    return next.find((folder) => folder.id === id)!;
  });
}

/** Removes the folder and its children. Caller re-homes boards that lived inside. */
export async function boardFoldersDelete(id: string): Promise<{ removedIds: string[]; parentId: string | null }> {
  const userId = requireUserId();
  return enqueue(userId, async () => {
    const folders = await boardFoldersList(userId);
    const current = folders.find((folder) => folder.id === id);
    if (!current) throw new Error(`Folder not found: ${id}`);
    const removedIds = boardFolderSubtreeIds(folders, id);
    const removed = new Set(removedIds);
    await saveFolders(
      userId,
      folders.filter((folder) => !removed.has(folder.id)),
    );
    return { removedIds, parentId: current.parentId };
  });
}
