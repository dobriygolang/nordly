import { dbGet, dbPut, requireUserId } from '@shared/db/nordlyDb';

export interface NoteFolder {
  id: string;
  name: string;
  /** Parent folder id; null = top-level. Missing on legacy rows → treated as null. */
  parentId: string | null;
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

function normalizeFolder(raw: NoteFolder): NoteFolder {
  return {
    ...raw,
    parentId: raw.parentId ?? null,
  };
}

export function collectSubtreeIds(folders: NoteFolder[], rootId: string): string[] {
  const ids = new Set<string>([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of folders) {
      if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) {
        ids.add(f.id);
        grew = true;
      }
    }
  }
  return [...ids];
}

function siblingNameTaken(
  folders: NoteFolder[],
  parentId: string | null,
  name: string,
  exceptId?: string,
): boolean {
  return folders.some(
    (f) =>
      f.id !== exceptId &&
      (f.parentId ?? null) === parentId &&
      f.name === name,
  );
}

export async function foldersStoreList(userId?: string): Promise<NoteFolder[]> {
  const uid = userId ?? requireUserId();
  const row = await dbGet<FoldersMetaRow>('meta', metaKey(uid));
  return (row?.folders ?? []).map(normalizeFolder);
}

async function updateFolders(
  userId: string,
  mutate: (folders: NoteFolder[]) => NoteFolder[],
): Promise<NoteFolder[]> {
  return enqueueFolderWrite(userId, async () => {
    const current = await foldersStoreList(userId);
    const next = mutate(current).map(normalizeFolder);
    await dbPut('meta', {
      key: metaKey(userId),
      userId,
      folders: next,
      updatedAt: Date.now(),
    } satisfies FoldersMetaRow);
    return next;
  });
}

export async function foldersStoreCreate(
  name: string,
  parentId?: string | null,
  userId?: string,
): Promise<NoteFolder> {
  const uid = userId ?? requireUserId();
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Folder name is empty');
  const parent = parentId ?? null;

  let created: NoteFolder | null = null;
  await updateFolders(uid, (folders) => {
    if (parent !== null && !folders.some((f) => f.id === parent)) {
      throw new Error(`Folder not found: ${parent}`);
    }
    if (siblingNameTaken(folders, parent, trimmed)) {
      throw new Error(`Folder already exists: ${trimmed}`);
    }
    const now = new Date().toISOString();
    created = {
      id: crypto.randomUUID(),
      name: trimmed,
      parentId: parent,
      createdAt: now,
      updatedAt: now,
    };
    return [...folders, created];
  });
  if (!created) throw new Error('Failed to create folder');
  return created;
}

/** Find sibling by name or create it. */
export async function foldersStoreFindOrCreate(
  name: string,
  parentId: string | null,
  userId?: string,
): Promise<NoteFolder> {
  const uid = userId ?? requireUserId();
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Folder name is empty');
  const folders = await foldersStoreList(uid);
  if (parentId !== null && !folders.some((f) => f.id === parentId)) {
    throw new Error(`Folder not found: ${parentId}`);
  }
  const existing = folders.find(
    (f) => (f.parentId ?? null) === parentId && f.name === trimmed,
  );
  if (existing) return existing;
  return foldersStoreCreate(trimmed, parentId, uid);
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
    const current = folders[idx];
    if (siblingNameTaken(folders, current.parentId ?? null, trimmed, id)) {
      throw new Error(`Folder already exists: ${trimmed}`);
    }
    updated = {
      ...current,
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

/** Deletes folder and all descendants. Returns deleted ids. */
export async function foldersStoreDelete(
  id: string,
  userId?: string,
): Promise<string[]> {
  const uid = userId ?? requireUserId();
  let deletedIds: string[] = [];
  await updateFolders(uid, (list) => {
    if (!list.some((f) => f.id === id)) {
      throw new Error(`Folder not found: ${id}`);
    }
    deletedIds = collectSubtreeIds(list, id);
    const remove = new Set(deletedIds);
    return list.filter((f) => !remove.has(f.id));
  });
  return deletedIds;
}
