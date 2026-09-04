import { collectSubtreeIds, type NoteFolder } from '@features/notes/repository/foldersStore';

import {
  vaultCreateFolder,
  vaultCreateNote,
  vaultListFolders,
  vaultListNotes,
  vaultMoveFolder,
  vaultMoveNote,
  vaultReadNote,
  vaultRenameFolder,
  vaultRenameNote,
  vaultTrashFolder,
  vaultTrashNote,
  vaultWriteNote,
} from './ipc';
import {
  enqueueVaultFileDelete,
  enqueueVaultFilePut,
  remapVaultPath,
  suppressVaultWatch,
} from './vaultOutbox';
import type { VaultNoteContent } from './types';

export interface VaultNoteDto {
  id: string;
  title: string;
  bodyMd: string;
  createdAt: Date | null;
  updatedAt: Date | null;
  sizeBytes: number;
  folderId?: string | null;
}

export interface VaultNoteSummaryDto {
  id: string;
  title: string;
  updatedAt: Date | null;
  sizeBytes: number;
  folderId?: string | null;
}

export interface VaultFolderMutation {
  folder: NoteFolder;
  /** Old relative folder path → new (for remapping note ids). */
  fromPath: string;
  toPath: string;
}

let vaultMutationTail: Promise<void> = Promise.resolve();
let nextVaultMutationSequence = 0;
let queuedPathRemaps: Array<{
  fromPath: string;
  toPath: string;
  throughSequence: number;
}> = [];

/** Keep all vault writers/path mutations ordered, and keep the queue usable after a failure. */
function withVaultMutation<T>(mutation: (sequence: number) => Promise<T>): Promise<T> {
  const sequence = ++nextVaultMutationSequence;
  const run = () => mutation(sequence);
  const result = vaultMutationTail.then(run, run);
  vaultMutationTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function resolveQueuedPath(path: string, sequence: number): string {
  let resolved = path;
  queuedPathRemaps = queuedPathRemaps.filter(
    (remap) => remap.throughSequence >= sequence,
  );
  for (const remap of queuedPathRemaps) {
    resolved = remapVaultPath(resolved, remap.fromPath, remap.toPath);
  }
  return resolved;
}

async function enqueueNotesAfterFolderRemap(fromPath: string, toPath: string): Promise<void> {
  const notes = await vaultListNotes();
  for (const n of notes) {
    if (n.path !== toPath && !n.path.startsWith(`${toPath}/`)) continue;
    const oldPath = remapVaultPath(n.path, toPath, fromPath);
    const content = await vaultReadNote(n.path);
    await enqueueVaultFilePut(n.path, content.bodyMd, 'md', n.updatedAtMs);
    if (oldPath !== n.path) await enqueueVaultFileDelete(oldPath);
  }
}

function recordQueuedPathRemap(fromPath: string, toPath: string): void {
  if (fromPath === toPath) return;
  queuedPathRemaps.push({
    fromPath,
    toPath,
    // Mutations already queued captured the old UI path. Later calls happen
    // after the successful mutation has returned and receive the remapped path.
    throughSequence: nextVaultMutationSequence,
  });
}

/** Serialize a path-sensitive vault side write (for example, a pasted image). */
export function withVaultNotePathMutation<T>(
  notePath: string,
  mutation: (resolvedNotePath: string) => Promise<T>,
): Promise<T> {
  return withVaultMutation((sequence) =>
    mutation(resolveQueuedPath(notePath, sequence)),
  );
}

function toNote(c: VaultNoteContent): VaultNoteDto {
  return {
    id: c.path,
    title: c.title,
    bodyMd: c.bodyMd,
    createdAt: null,
    updatedAt: c.updatedAtMs ? new Date(c.updatedAtMs) : null,
    sizeBytes: c.sizeBytes,
    folderId: c.folderPath ?? null,
  };
}

function toSummary(c: {
  path: string;
  title: string;
  updatedAtMs: number;
  sizeBytes: number;
  folderPath: string | null;
}): VaultNoteSummaryDto {
  return {
    id: c.path,
    title: c.title,
    updatedAt: c.updatedAtMs ? new Date(c.updatedAtMs) : null,
    sizeBytes: c.sizeBytes,
    folderId: c.folderPath ?? null,
  };
}

function toFolder(f: {
  path: string;
  name: string;
  parentPath: string | null;
}): NoteFolder {
  const now = new Date().toISOString();
  return {
    id: f.path,
    name: f.name,
    parentId: f.parentPath ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function vaultIoListNotes(): Promise<{ notes: VaultNoteSummaryDto[] }> {
  const rows = await vaultListNotes();
  return {
    notes: rows.map((r) =>
      toSummary({
        path: r.path,
        title: r.title,
        updatedAtMs: r.updatedAtMs,
        sizeBytes: r.sizeBytes,
        folderPath: r.folderPath,
      }),
    ),
  };
}

export async function vaultIoGetNote(path: string): Promise<VaultNoteDto> {
  return toNote(await vaultReadNote(path));
}

async function createNoteUnlocked(
  title: string,
  bodyMd: string,
  folderId?: string | null,
  sequence?: number,
): Promise<VaultNoteDto> {
  suppressVaultWatch();
  const currentFolder =
    folderId && sequence != null
      ? resolveQueuedPath(folderId, sequence)
      : folderId;
  const note = toNote(await vaultCreateNote(title, bodyMd, currentFolder ?? null));
  await enqueueVaultFilePut(
    note.id,
    note.bodyMd,
    'md',
    note.updatedAt?.getTime() ?? Date.now(),
  );
  return note;
}

export function vaultIoCreateNote(
  title: string,
  bodyMd: string,
  folderId?: string | null,
): Promise<VaultNoteDto> {
  return withVaultMutation((sequence) =>
    createNoteUnlocked(title, bodyMd, folderId, sequence),
  );
}

async function updateNoteUnlocked(
  path: string,
  title: string,
  bodyMd: string,
  sequence: number,
): Promise<VaultNoteDto> {
  suppressVaultWatch();
  const currentPath = resolveQueuedPath(path, sequence);
  const existing = await vaultReadNote(currentPath);
  // Persist the latest body before changing its path. If rename fails, the old
  // path still contains the user's newest text and a retry is safe.
  let written = await vaultWriteNote(currentPath, bodyMd);
  let renamedFrom: string | null = null;
  if (title.trim() && title !== existing.title) {
    const renamed = await vaultRenameNote(written.path, title);
    if (renamed.path !== currentPath) {
      recordQueuedPathRemap(currentPath, renamed.path);
      renamedFrom = currentPath;
    }
    written = renamed;
  }
  const note = toNote(written);
  await enqueueVaultFilePut(
    note.id,
    note.bodyMd,
    'md',
    note.updatedAt?.getTime() ?? Date.now(),
  );
  if (renamedFrom) await enqueueVaultFileDelete(renamedFrom);
  return note;
}

export function vaultIoUpdateNote(
  path: string,
  title: string,
  bodyMd: string,
): Promise<VaultNoteDto> {
  return withVaultMutation((sequence) =>
    updateNoteUnlocked(path, title, bodyMd, sequence),
  );
}

export function vaultIoDeleteNote(path: string): Promise<void> {
  return withVaultMutation(async (sequence) => {
    suppressVaultWatch();
    const currentPath = resolveQueuedPath(path, sequence);
    await vaultTrashNote(currentPath);
    await enqueueVaultFileDelete(currentPath);
  });
}

export async function vaultIoListFolders(): Promise<NoteFolder[]> {
  const rows = await vaultListFolders();
  return rows.map(toFolder);
}

async function createFolderUnlocked(
  name: string,
  parentId?: string | null,
  sequence?: number,
): Promise<NoteFolder> {
  suppressVaultWatch();
  const currentParent =
    parentId && sequence != null
      ? resolveQueuedPath(parentId, sequence)
      : parentId;
  return toFolder(await vaultCreateFolder(name, currentParent ?? null));
}

export function vaultIoCreateFolder(
  name: string,
  parentId?: string | null,
): Promise<NoteFolder> {
  return withVaultMutation((sequence) =>
    createFolderUnlocked(name, parentId, sequence),
  );
}

export function vaultIoRenameFolder(id: string, name: string): Promise<VaultFolderMutation> {
  return withVaultMutation(async (sequence) => {
    suppressVaultWatch();
    const currentId = resolveQueuedPath(id, sequence);
    const folder = toFolder(await vaultRenameFolder(currentId, name));
    recordQueuedPathRemap(currentId, folder.id);
    await enqueueNotesAfterFolderRemap(currentId, folder.id);
    return { folder, fromPath: currentId, toPath: folder.id };
  });
}

export function vaultIoMoveFolder(
  id: string,
  parentId: string | null,
): Promise<VaultFolderMutation> {
  return withVaultMutation(async (sequence) => {
    suppressVaultWatch();
    const currentId = resolveQueuedPath(id, sequence);
    const currentParent = parentId
      ? resolveQueuedPath(parentId, sequence)
      : null;
    const folder = toFolder(await vaultMoveFolder(currentId, currentParent));
    recordQueuedPathRemap(currentId, folder.id);
    await enqueueNotesAfterFolderRemap(currentId, folder.id);
    return { folder, fromPath: currentId, toPath: folder.id };
  });
}

export function vaultIoDeleteFolder(
  id: string,
): Promise<{ deletedFolderIds: string[]; deletedNoteIds: string[] }> {
  return withVaultMutation(async (sequence) => {
    suppressVaultWatch();
    const currentId = resolveQueuedPath(id, sequence);
    const folders = await vaultIoListFolders();
    if (!folders.some((f) => f.id === currentId)) {
      throw new Error(`Folder not found: ${currentId}`);
    }
    const deletedFolderIds = collectSubtreeIds(folders, currentId);
    const { notes } = await vaultIoListNotes();
    const deletedNoteIds = notes
      .filter((n) => n.folderId != null && deletedFolderIds.includes(n.folderId))
      .map((n) => n.id);
    await vaultTrashFolder(currentId);
    for (const noteId of deletedNoteIds) {
      await enqueueVaultFileDelete(noteId);
    }
    return { deletedFolderIds, deletedNoteIds };
  });
}

export function vaultIoMoveNoteToFolder(
  noteId: string,
  folderId: string | null,
): Promise<VaultNoteDto> {
  return withVaultMutation(async (sequence) => {
    suppressVaultWatch();
    const currentNoteId = resolveQueuedPath(noteId, sequence);
    const currentFolderId = folderId
      ? resolveQueuedPath(folderId, sequence)
      : null;
    const moved = await vaultMoveNote(currentNoteId, currentFolderId);
    if (moved.path !== currentNoteId) {
      recordQueuedPathRemap(currentNoteId, moved.path);
    }
    await enqueueVaultFilePut(
      moved.path,
      moved.bodyMd,
      'md',
      moved.updatedAtMs || Date.now(),
    );
    if (moved.path !== currentNoteId) {
      await enqueueVaultFileDelete(currentNoteId);
    }
    return toNote(moved);
  });
}

export async function vaultIoEnsureFolderPath(
  segments: string[],
  rootParentId: string | null = null,
): Promise<{ folderId: string | null; created: NoteFolder[] }> {
  return withVaultMutation(async (sequence) => {
    let parentId = rootParentId
      ? resolveQueuedPath(rootParentId, sequence)
      : null;
    const created: NoteFolder[] = [];
    for (const segment of segments) {
      const trimmed = segment.trim();
      if (!trimmed) continue;
      const before = await vaultIoListFolders();
      const existing = before.find(
        (f) => (f.parentId ?? null) === parentId && f.name === trimmed,
      );
      if (existing) {
        parentId = existing.id;
        continue;
      }
      const folder = await createFolderUnlocked(trimmed, parentId, sequence);
      created.push(folder);
      parentId = folder.id;
    }
    return { folderId: parentId, created };
  });
}

export function vaultIoOpenWikiLink(
  linkText: string,
): Promise<{ noteId: string; created: boolean }> {
  return withVaultMutation(async (sequence) => {
    const trimmed = linkText.trim();
    if (!trimmed) throw new Error('Wiki link title is empty');
    const { notes } = await vaultIoListNotes();
    const hit = notes.find((n) => n.title.toLowerCase() === trimmed.toLowerCase());
    if (hit) return { noteId: hit.id, created: false };
    const note = await createNoteUnlocked(trimmed, '', null, sequence);
    return { noteId: note.id, created: true };
  });
}
