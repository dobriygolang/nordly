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
import { enqueueVaultFileDelete, enqueueVaultFilePut, suppressVaultWatch } from './vaultOutbox';
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

export async function vaultIoCreateNote(
  title: string,
  bodyMd: string,
  folderId?: string | null,
): Promise<VaultNoteDto> {
  suppressVaultWatch();
  const note = toNote(await vaultCreateNote(title, bodyMd, folderId ?? null));
  await enqueueVaultFilePut(
    note.id,
    note.bodyMd,
    'md',
    note.updatedAt?.getTime() ?? Date.now(),
  );
  return note;
}

export async function vaultIoUpdateNote(
  path: string,
  title: string,
  bodyMd: string,
): Promise<VaultNoteDto> {
  suppressVaultWatch();
  let currentPath = path;
  const existing = await vaultReadNote(path);
  if (title.trim() && title !== existing.title) {
    const renamed = await vaultRenameNote(path, title);
    if (renamed.path !== path) {
      await enqueueVaultFileDelete(path);
    }
    currentPath = renamed.path;
  }
  const written = toNote(await vaultWriteNote(currentPath, bodyMd));
  await enqueueVaultFilePut(
    written.id,
    written.bodyMd,
    'md',
    written.updatedAt?.getTime() ?? Date.now(),
  );
  return written;
}

export async function vaultIoDeleteNote(path: string): Promise<void> {
  suppressVaultWatch();
  await vaultTrashNote(path);
  await enqueueVaultFileDelete(path);
}

export async function vaultIoListFolders(): Promise<NoteFolder[]> {
  const rows = await vaultListFolders();
  return rows.map(toFolder);
}

export async function vaultIoCreateFolder(
  name: string,
  parentId?: string | null,
): Promise<NoteFolder> {
  suppressVaultWatch();
  return toFolder(await vaultCreateFolder(name, parentId ?? null));
}

export async function vaultIoRenameFolder(id: string, name: string): Promise<VaultFolderMutation> {
  suppressVaultWatch();
  const folder = toFolder(await vaultRenameFolder(id, name));
  return { folder, fromPath: id, toPath: folder.id };
}

export async function vaultIoMoveFolder(
  id: string,
  parentId: string | null,
): Promise<VaultFolderMutation> {
  suppressVaultWatch();
  const folder = toFolder(await vaultMoveFolder(id, parentId));
  return { folder, fromPath: id, toPath: folder.id };
}

export async function vaultIoDeleteFolder(
  id: string,
): Promise<{ deletedFolderIds: string[]; deletedNoteIds: string[] }> {
  suppressVaultWatch();
  const folders = await vaultIoListFolders();
  if (!folders.some((f) => f.id === id)) {
    throw new Error(`Folder not found: ${id}`);
  }
  const deletedFolderIds = collectSubtreeIds(folders, id);
  const { notes } = await vaultIoListNotes();
  const deletedNoteIds = notes
    .filter((n) => n.folderId != null && deletedFolderIds.includes(n.folderId))
    .map((n) => n.id);
  for (const noteId of deletedNoteIds) {
    await enqueueVaultFileDelete(noteId);
  }
  await vaultTrashFolder(id);
  return { deletedFolderIds, deletedNoteIds };
}

export async function vaultIoMoveNoteToFolder(
  noteId: string,
  folderId: string | null,
): Promise<VaultNoteDto> {
  suppressVaultWatch();
  const moved = await vaultMoveNote(noteId, folderId);
  if (moved.path !== noteId) {
    await enqueueVaultFileDelete(noteId);
  }
  await enqueueVaultFilePut(
    moved.path,
    moved.bodyMd,
    'md',
    moved.updatedAtMs || Date.now(),
  );
  return toNote(moved);
}

export async function vaultIoEnsureFolderPath(
  segments: string[],
  rootParentId: string | null = null,
): Promise<{ folderId: string | null; created: NoteFolder[] }> {
  let parentId = rootParentId;
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
    const folder = await vaultIoCreateFolder(trimmed, parentId);
    created.push(folder);
    parentId = folder.id;
  }
  return { folderId: parentId, created };
}

export async function vaultIoOpenWikiLink(
  linkText: string,
): Promise<{ noteId: string; created: boolean }> {
  const trimmed = linkText.trim();
  if (!trimmed) throw new Error('Wiki link title is empty');
  const { notes } = await vaultIoListNotes();
  const hit = notes.find((n) => n.title.toLowerCase() === trimmed.toLowerCase());
  if (hit) return { noteId: hit.id, created: false };
  const note = await vaultIoCreateNote(trimmed, '');
  return { noteId: note.id, created: true };
}
