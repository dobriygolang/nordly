// Local-first notes — filesystem vault SoT when bound; IndexedDB until first vault pick (non-Tauri tests).
import { type NoteFolder } from '@features/notes/repository/foldersStore';
import {
  remoteGetPublishStatus,
  remoteShareNoteToWeb,
  remoteUnpublishNote,
} from '@features/notes/remote/publishRemote';
import type {
  PublishStatus,
  PublishToWebOptions,
} from '@features/notes/model/publishOptions';
import { DEFAULT_PUBLISH_OPTIONS } from '@features/notes/model/publishOptions';
import {
  type Note,
  type NoteSummary,
} from '@features/notes/model/note';
import { ensureAccessTokenForSync } from '@shared/api/authSession';
import { clearServerId, getServerId } from '@shared/sync/idMap';
import { requireUserId } from '@shared/db/nordlyDb';
import { deleteVaultSyncIndex, getVaultSyncIndex } from '@features/notes/repository/vaultSyncIndexStore';
import { SyncDomain } from '@shared/sync/types';
import { syncNow } from '@shared/sync/SyncEngine';
import {
  ensureNoteServerId,
  pushAllNotesEncrypted,
  withNotesRemoteMutation,
} from '@features/notes/sync/notesSync';
import {
  canUseLocalApp,
  isCloudEnabled,
  isSyncEnabled,
} from '@shared/sync/syncConfig';
import { mapPool } from '@shared/lib/mapPool';
import { collectPublishPayload } from '../lib/publishPayload';
import { isNotesSyncEnabled } from '@features/notes/lib/notesSyncConsent';
import { enqueueVaultFilePut, isNotesVaultBound, vaultListNotes, vaultReadNote } from '@features/notes/vault';
import { assertPublishAllowed } from './notesSync';
import { notesPersistence } from './notesPersistence';

export type { PublishToWebOptions } from '@features/notes/model/publishOptions';
export type { PublishStatus } from '@features/notes/model/publishOptions';
export type { Note, NoteSummary } from '@features/notes/model/note';
export { isNoteVaultLocked } from '@features/notes/model/note';
export type { NoteFolder };
export { collectSubtreeIds, nextUniqueFolderName } from '@features/notes/repository/foldersStore';
export { isNotesVaultBound } from '@features/notes/vault';
export { refreshNotesVaultBoundCache, setNotesVaultBoundCache } from './notesPersistence';

/** Re-queues every vault file so the next sync uploads ciphertext. */
export async function encryptAllNotesForVault(): Promise<void> {
  if (await isNotesVaultBound()) {
    if (!isNotesSyncEnabled()) return;
    const notes = await vaultListNotes();
    for (const meta of notes) {
      const content = await vaultReadNote(meta.path);
      await enqueueVaultFilePut(meta.path, content.bodyMd, 'md', content.updatedAtMs);
    }
    return;
  }
  await pushAllNotesEncrypted();
}

export async function listNotes(): Promise<{ notes: NoteSummary[] }> {
  return (await notesPersistence()).listNotes();
}

async function resolveNote(id: string): Promise<Note | null> {
  return (await notesPersistence()).resolveNote(id);
}

export async function getNote(id: string): Promise<Note> {
  const note = await resolveNote(id);
  if (!note) throw new Error(`Note not found: ${id}`);
  return note;
}

export async function createNote(
  title: string,
  bodyMd: string,
  folderId?: string | null,
): Promise<Note> {
  return (await notesPersistence()).createNote(title, bodyMd, folderId);
}

export async function listFolders(): Promise<NoteFolder[]> {
  return (await notesPersistence()).listFolders();
}

export async function createFolder(
  name: string,
  parentId?: string | null,
): Promise<NoteFolder> {
  return (await notesPersistence()).createFolder(name, parentId);
}

export async function renameFolder(id: string, name: string): Promise<NoteFolder> {
  const { folder } = await (await notesPersistence()).renameFolder(id, name);
  return folder;
}

/**
 * Rename a vault folder and return path remap so the UI can update note ids.
 * IDB mode: fromPath === toPath === id (UUID stable).
 */
export async function renameFolderWithRemap(
  id: string,
  name: string,
): Promise<{ folder: NoteFolder; fromPath: string; toPath: string }> {
  return (await notesPersistence()).renameFolder(id, name);
}

/**
 * Move a folder under a new parent (`null` = top-level).
 * Notes and nested folders travel with it (they keep pointing at the same ids).
 */
export async function moveFolder(id: string, parentId: string | null): Promise<NoteFolder> {
  const { folder } = await (await notesPersistence()).moveFolder(id, parentId);
  return folder;
}

export async function moveFolderWithRemap(
  id: string,
  parentId: string | null,
): Promise<{ folder: NoteFolder; fromPath: string; toPath: string }> {
  return (await notesPersistence()).moveFolder(id, parentId);
}

/**
 * Walk/create folder chain under `rootParentId`.
 * Empty segments → returns `rootParentId` (no new folders).
 */
export async function ensureFolderPath(
  segments: string[],
  rootParentId: string | null = null,
): Promise<{ folderId: string | null; created: NoteFolder[] }> {
  return (await notesPersistence()).ensureFolderPath(segments, rootParentId);
}

/**
 * Deletes the folder (and descendants) and soft-deletes every note inside them
 * (attachments + sync outbox via deleteNote). Notes are removed first so a mid-loop
 * failure cannot leave orphans after the folder row is already gone.
 */
export async function deleteFolder(
  id: string,
): Promise<{ deletedFolderIds: string[]; deletedNoteIds: string[] }> {
  return (await notesPersistence()).deleteFolder(id);
}

export async function moveNoteToFolder(
  noteId: string,
  folderId: string | null,
): Promise<{ noteId: string; folderId: string | null }> {
  return (await notesPersistence()).moveNoteToFolder(noteId, folderId);
}

export async function updateNote(id: string, title: string, bodyMd: string): Promise<Note> {
  return (await notesPersistence()).updateNote(id, title, bodyMd);
}

export async function openWikiLink(
  linkText: string,
): Promise<{ noteId: string; created: boolean }> {
  return (await notesPersistence()).openWikiLink(linkText);
}

async function lookupServerNoteId(localId: string): Promise<string | null> {
  if (await isNotesVaultBound()) {
    const row = await getVaultSyncIndex(requireUserId(), localId);
    return row?.serverId ?? null;
  }
  return getServerId(SyncDomain.Notes, localId);
}

async function forgetServerNoteId(localId: string): Promise<void> {
  if (await isNotesVaultBound()) {
    await deleteVaultSyncIndex(requireUserId(), localId);
    return;
  }
  await clearServerId(SyncDomain.Notes, localId);
}

async function resolveServerNoteId(localId: string): Promise<string | null> {
  assertPublishAllowed();
  if (!isCloudEnabled() || !canUseLocalApp()) return null;
  if (!(await ensureAccessTokenForSync())) return null;
  const mapped = await lookupServerNoteId(localId);
  if (mapped) return mapped;
  if (isSyncEnabled()) await syncNow();
  const afterSync = await lookupServerNoteId(localId);
  if (afterSync) return afterSync;
  if (await isNotesVaultBound()) return null;
  return ensureNoteServerId(localId);
}

async function mappedServerNoteId(localId: string): Promise<string | null> {
  assertPublishAllowed();
  if (!isCloudEnabled() || !canUseLocalApp()) return null;
  if (!(await ensureAccessTokenForSync())) return null;
  return lookupServerNoteId(localId);
}

export async function getPublishStatus(noteId: string): Promise<PublishStatus> {
  const serverId = await mappedServerNoteId(noteId);
  if (!serverId) return { published: false };
  const status = await remoteGetPublishStatus(serverId);
  if (status === null) {
    await forgetServerNoteId(noteId);
    return { published: false };
  }
  return status;
}

export async function countPublishedNotes(): Promise<number> {
  assertPublishAllowed();
  if (!isCloudEnabled() || !canUseLocalApp()) {
    throw new Error('Published note count requires a cloud session');
  }

  const { notes } = await listNotes();
  const published = await mapPool(notes, 6, async (note) => {
    const serverId = await lookupServerNoteId(note.id);
    if (!serverId) return false;
    return (await getPublishStatus(note.id)).published;
  });
  return published.filter(Boolean).length;
}

export async function publishNoteToWeb(
  noteId: string,
  options: PublishToWebOptions = DEFAULT_PUBLISH_OPTIONS,
): Promise<PublishStatus> {
  assertPublishAllowed();
  const serverId = await resolveServerNoteId(noteId);
  if (!serverId) throw new Error('note is not on the server yet');
  return withNotesRemoteMutation(async () => {
    const note = await getNote(noteId);
    // Do not remoteUpdateNote first: published GETs would briefly serve raw
    // nordly-asset: refs, and vault notes must not push plaintext body_md.
    const published = await collectPublishPayload(note.id, note.bodyMd);
    await remoteShareNoteToWeb(serverId, published.body, note.title, options, published.attachments);
    const status = await remoteGetPublishStatus(serverId);
    if (status === null) throw new Error('Note not found on server');
    return status;
  });
}

/** Update publish options / body on an already-published note — no full sync pass. */
export async function updatePublishedNoteOptions(
  noteId: string,
  options: PublishToWebOptions,
): Promise<PublishStatus> {
  assertPublishAllowed();
  const serverId = await mappedServerNoteId(noteId);
  if (!serverId) throw new Error('note is not on the server yet');
  return withNotesRemoteMutation(async () => {
    const note = await getNote(noteId);
    // Share rewrites asset refs; never pre-write nordly-asset: into published body_md.
    const published = await collectPublishPayload(note.id, note.bodyMd);
    await remoteShareNoteToWeb(serverId, published.body, note.title, options, published.attachments);
    const status = await remoteGetPublishStatus(serverId);
    if (status === null) throw new Error('Note not found on server');
    return status;
  });
}

export async function unpublishNoteFromWeb(noteId: string): Promise<void> {
  const serverId = await mappedServerNoteId(noteId);
  if (!serverId) throw new Error('note is not on the server yet');
  await withNotesRemoteMutation(() => remoteUnpublishNote(serverId));
}

export async function deleteNote(id: string): Promise<void> {
  await (await notesPersistence()).deleteNote(id);
}
