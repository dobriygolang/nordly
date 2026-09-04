import {
  collectSubtreeIds,
  foldersStoreCreate,
  foldersStoreDelete,
  foldersStoreList,
  foldersStoreMove,
  foldersStoreRename,
  type NoteFolder,
} from '@features/notes/repository/foldersStore';
import {
  notesStoreGet,
  notesStoreList,
  notesStoreSetFolderId,
  notesStoreIdsInFolders,
  notesStoreSoftDelete,
  notesStoreUpsert,
  type StoredWikiLink,
} from '@features/notes/repository/notesStore';
import { buildWikiLinksWire, resolveWikiLinks } from '@features/notes/lib/wikiLinks';
import { deleteAttachmentsForNote, deleteNoteAttachment } from '@features/notes/api/attachmentsClient';
import { extractNordlyAssetIds } from '@features/notes/lib/noteAttachments';
import { cancelOutboxForEntity, enqueueOutbox } from '@shared/sync/outbox';
import { OutboxOp, SyncDomain } from '@shared/sync/types';
import { scheduleSync } from '@shared/sync/SyncEngine';
import { getServerId } from '@shared/sync/idMap';
import { isSyncQueueEnabled } from '@shared/sync/syncConfig';
import {
  isNotesVaultBound,
  vaultIoCreateFolder,
  vaultIoCreateNote,
  vaultIoDeleteFolder,
  vaultIoDeleteNote,
  vaultIoEnsureFolderPath,
  vaultIoGetNote,
  vaultIoListFolders,
  vaultIoListNotes,
  vaultIoMoveFolder,
  vaultIoMoveNoteToFolder,
  vaultIoOpenWikiLink,
  vaultIoRenameFolder,
  vaultIoUpdateNote,
} from '@features/notes/vault';
import type { Note, NoteSummary } from '@features/notes/model/note';

export interface NotesPersistence {
  readonly kind: 'vault' | 'idb';
  listNotes(): Promise<{ notes: NoteSummary[] }>;
  resolveNote(id: string): Promise<Note | null>;
  createNote(title: string, bodyMd: string, folderId?: string | null): Promise<Note>;
  updateNote(id: string, title: string, bodyMd: string): Promise<Note>;
  deleteNote(id: string): Promise<void>;
  listFolders(): Promise<NoteFolder[]>;
  createFolder(name: string, parentId?: string | null): Promise<NoteFolder>;
  renameFolder(
    id: string,
    name: string,
  ): Promise<{ folder: NoteFolder; fromPath: string; toPath: string }>;
  moveFolder(
    id: string,
    parentId: string | null,
  ): Promise<{ folder: NoteFolder; fromPath: string; toPath: string }>;
  deleteFolder(id: string): Promise<{ deletedFolderIds: string[]; deletedNoteIds: string[] }>;
  moveNoteToFolder(
    noteId: string,
    folderId: string | null,
  ): Promise<{ noteId: string; folderId: string | null }>;
  ensureFolderPath(
    segments: string[],
    rootParentId?: string | null,
  ): Promise<{ folderId: string | null; created: NoteFolder[] }>;
  openWikiLink(linkText: string): Promise<{ noteId: string; created: boolean }>;
  wikiLinksForSave(bodyMd: string): Promise<StoredWikiLink[]>;
}

let vaultBoundCache: boolean | null = null;

export async function refreshNotesVaultBoundCache(): Promise<boolean> {
  vaultBoundCache = await isNotesVaultBound();
  return vaultBoundCache;
}

export function setNotesVaultBoundCache(bound: boolean): void {
  vaultBoundCache = bound;
}

export async function isFsVaultActive(): Promise<boolean> {
  if (vaultBoundCache === null) {
    vaultBoundCache = await isNotesVaultBound();
  }
  return vaultBoundCache;
}

const vaultStore: NotesPersistence = {
  kind: 'vault',

  listNotes: () => vaultIoListNotes(),

  async resolveNote(id) {
    try {
      return await vaultIoGetNote(id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/not found|no such file|os error 2/i.test(msg)) {
        return null;
      }
      throw err;
    }
  },

  createNote: (title, bodyMd, folderId) => vaultIoCreateNote(title, bodyMd, folderId),

  updateNote: (id, title, bodyMd) => vaultIoUpdateNote(id, title, bodyMd),

  deleteNote: (id) => vaultIoDeleteNote(id),

  listFolders: () => vaultIoListFolders(),

  createFolder: (name, parentId) => vaultIoCreateFolder(name, parentId),

  renameFolder: (id, name) => vaultIoRenameFolder(id, name),

  moveFolder: (id, parentId) => vaultIoMoveFolder(id, parentId),

  deleteFolder: (id) => vaultIoDeleteFolder(id),

  async moveNoteToFolder(noteId, folderId) {
    const note = await vaultIoMoveNoteToFolder(noteId, folderId);
    return { noteId: note.id, folderId: note.folderId ?? null };
  },

  ensureFolderPath: (segments, rootParentId = null) =>
    vaultIoEnsureFolderPath(segments, rootParentId),

  openWikiLink: (linkText) => vaultIoOpenWikiLink(linkText),

  async wikiLinksForSave(bodyMd) {
    const { notes } = await vaultIoListNotes();
    return buildWikiLinksWire(bodyMd, notes);
  },
};

async function idbResolveNote(id: string): Promise<Note | null> {
  const direct = await notesStoreGet(id);
  if (direct) return direct;
  const serverId = await getServerId(SyncDomain.Notes, id);
  if (serverId && serverId !== id) return notesStoreGet(serverId);
  return null;
}

async function idbWikiLinksForSave(bodyMd: string): Promise<StoredWikiLink[]> {
  const notes = await notesStoreList();
  return buildWikiLinksWire(bodyMd, notes);
}

async function idbCreateNote(
  title: string,
  bodyMd: string,
  folderId?: string | null,
): Promise<Note> {
  const id = crypto.randomUUID();
  const wikiLinks = await idbWikiLinksForSave(bodyMd);
  const note = await notesStoreUpsert(id, title, bodyMd, undefined, wikiLinks, folderId ?? null);
  if (isSyncQueueEnabled()) {
    await enqueueOutbox(SyncDomain.Notes, OutboxOp.Create, id, { title, bodyMd, wikiLinks });
    scheduleSync();
  }
  return note;
}

async function idbSweepOrphanAttachments(noteId: string, bodyMd: string): Promise<void> {
  const referenced = new Set(extractNordlyAssetIds(bodyMd));
  const { attachmentsStoreListByNote } = await import(
    '@features/notes/repository/attachmentsStore'
  );
  const list = await attachmentsStoreListByNote(noteId);
  for (const attachment of list) {
    if (referenced.has(attachment.id)) continue;
    await deleteNoteAttachment(attachment.id);
  }
}

async function idbUpdateNote(id: string, title: string, bodyMd: string): Promise<Note> {
  const prev = await idbResolveNote(id);
  if (!prev) throw new Error(`Note not found: ${id}`);
  const canonicalId = prev.id;
  const wikiLinks = await idbWikiLinksForSave(bodyMd);
  const note = await notesStoreUpsert(canonicalId, title, bodyMd, undefined, wikiLinks);
  await idbSweepOrphanAttachments(canonicalId, bodyMd);
  if (isSyncQueueEnabled()) {
    if (id !== canonicalId) await cancelOutboxForEntity(SyncDomain.Notes, id);
    await enqueueOutbox(SyncDomain.Notes, OutboxOp.Update, canonicalId, { title, bodyMd, wikiLinks });
    scheduleSync();
  }
  return note;
}

async function idbDeleteNote(id: string): Promise<void> {
  const prev = await idbResolveNote(id);
  // Idempotent — bulk/folder cascade may already have removed the row.
  if (!prev) return;
  const canonicalId = prev.id;
  await deleteAttachmentsForNote(canonicalId, { syncRemote: false });
  await notesStoreSoftDelete(canonicalId);
  if (isSyncQueueEnabled()) {
    if (id !== canonicalId) await cancelOutboxForEntity(SyncDomain.Notes, id);
    await cancelOutboxForEntity(SyncDomain.Notes, canonicalId);
    await enqueueOutbox(SyncDomain.Notes, OutboxOp.Delete, canonicalId, {});
    scheduleSync();
  }
}

const idbStore: NotesPersistence = {
  kind: 'idb',

  async listNotes() {
    const notes = await notesStoreList();
    return { notes };
  },

  resolveNote: idbResolveNote,

  createNote: idbCreateNote,

  updateNote: idbUpdateNote,

  deleteNote: idbDeleteNote,

  listFolders: () => foldersStoreList(),

  createFolder: (name, parentId) => foldersStoreCreate(name, parentId ?? null),

  async renameFolder(id, name) {
    const folder = await foldersStoreRename(id, name);
    return { folder, fromPath: id, toPath: id };
  },

  async moveFolder(id, parentId) {
    const folder = await foldersStoreMove(id, parentId);
    return { folder, fromPath: id, toPath: id };
  },

  async deleteFolder(id) {
    const folders = await foldersStoreList();
    if (!folders.some((f) => f.id === id)) {
      throw new Error(`Folder not found: ${id}`);
    }
    const deletedFolderIds = collectSubtreeIds(folders, id);
    const noteIds = await notesStoreIdsInFolders(deletedFolderIds);
    for (const noteId of noteIds) {
      await idbDeleteNote(noteId);
    }
    await foldersStoreDelete(id);
    return { deletedFolderIds, deletedNoteIds: noteIds };
  },

  async moveNoteToFolder(noteId, folderId) {
    const prev = await idbResolveNote(noteId);
    if (!prev) throw new Error(`Note not found: ${noteId}`);
    await notesStoreSetFolderId(prev.id, folderId);
    return { noteId: prev.id, folderId };
  },

  async ensureFolderPath(segments, rootParentId = null) {
    let parentId = rootParentId;
    const created: NoteFolder[] = [];
    for (const segment of segments) {
      const trimmed = segment.trim();
      if (!trimmed) continue;
      const before = await foldersStoreList();
      const existing = before.find(
        (f) => (f.parentId ?? null) === parentId && f.name === trimmed,
      );
      if (existing) {
        parentId = existing.id;
        continue;
      }
      const folder = await foldersStoreCreate(trimmed, parentId);
      created.push(folder);
      parentId = folder.id;
    }
    return { folderId: parentId, created };
  },

  async openWikiLink(linkText) {
    const trimmed = linkText.trim();
    if (!trimmed) throw new Error('Wiki link title is empty');

    const notes = await notesStoreList();
    const [resolved] = resolveWikiLinks([{ linkText: trimmed }], notes);
    if (resolved?.targetNoteId) {
      return { noteId: resolved.targetNoteId, created: false };
    }

    const note = await idbCreateNote(trimmed, '');
    return { noteId: note.id, created: true };
  },

  wikiLinksForSave: idbWikiLinksForSave,
};

export async function notesPersistence(): Promise<NotesPersistence> {
  return (await isFsVaultActive()) ? vaultStore : idbStore;
}
