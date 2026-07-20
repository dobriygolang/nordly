// Local-first notes — IndexedDB source of truth; background sync when enabled.
import { encryptText, isVaultUnlocked } from '@shared/crypto/vault';
import { isVaultEnabledSync } from '@shared/crypto/vaultPrefs';
import {
  foldersStoreCreate,
  foldersStoreDelete,
  foldersStoreList,
  foldersStoreRename,
  type NoteFolder,
} from '@features/notes/repository/foldersStore';
import {
  notesStoreGet,
  notesStoreList,
  notesStoreSetFolderId,
  notesStoreSoftDelete,
  notesStoreUnfileFolder,
  notesStoreUpsert,
  type StoredWikiLink,
} from '@features/notes/repository/notesStore';
import { remoteUpdateNote } from '@features/notes/remote/notesRemote';
import { buildWikiLinksWire, resolveWikiLinks } from '@features/notes/lib/wikiLinks';
import {
  remoteGetPublishStatus,
  remoteMakeNotePrivate,
  remoteShareNoteToWeb,
  remoteUnpublishNote,
  type PublishStatus,
} from '@features/notes/remote/publishRemote';
import type { PublishToWebOptions } from '@features/notes/model/publishOptions';
import { DEFAULT_PUBLISH_OPTIONS } from '@features/notes/model/publishOptions';
import { ensureAccessTokenForSync } from '@shared/api/authSession';
import { clearServerId, getServerId } from '@shared/sync/idMap';
import { cancelOutboxForEntity, enqueueOutbox } from '@shared/sync/outbox';
import { scheduleSync, syncNow } from '@shared/sync/SyncEngine';
import {
  ensureNoteServerId,
  pushAllNotesEncrypted,
  withNotesRemoteMutation,
} from '@features/notes/sync/notesSync';
import {
  canUseLocalApp,
  isCloudEnabled,
  isSyncEnabled,
  isSyncQueueEnabled,
} from '@shared/sync/syncConfig';
import { useFeatureUsageStore } from '@shared/model/featureUsage';
import { mapPool } from '@shared/lib/mapPool';
import { deleteAttachmentsForNote, deleteNoteAttachment } from '@features/notes/api/attachmentsClient';
import {
  AttachmentError,
  bytesToBase64,
  extractNordlyAssetIds,
} from '@features/notes/lib/noteAttachments';
import {
  attachmentsStoreGetPlainBytes,
  attachmentsStoreListByNote,
} from '@features/notes/repository/attachmentsStore';
import type { PublishedAttachmentInput } from '@features/notes/remote/publishRemote';

export type { PublishToWebOptions } from '@features/notes/model/publishOptions';
export type { PublishStatus };
export type { NoteFolder };

export interface Note {
  id: string;
  title: string;
  bodyMd: string;
  createdAt: Date | null;
  updatedAt: Date | null;
  sizeBytes: number;
  /** True when E2EE vault is on but passphrase was not entered yet. */
  vaultLocked?: boolean;
  /** Local-only folder id (not synced). */
  folderId?: string | null;
}

export interface NoteSummary {
  id: string;
  title: string;
  updatedAt: Date | null;
  sizeBytes: number;
  vaultLocked?: boolean;
  /** Local-only folder id (not synced). */
  folderId?: string | null;
}

export function isNoteVaultLocked(note: Pick<NoteSummary, 'vaultLocked'>): boolean {
  return note.vaultLocked === true;
}

/** Rewrites all remotely synced notes with vault encryption after vault enablement. */
export async function encryptAllNotesForVault(): Promise<void> {
  await pushAllNotesEncrypted();
}

async function wikiLinksForSave(bodyMd: string): Promise<StoredWikiLink[]> {
  const notes = await notesStoreList();
  return buildWikiLinksWire(bodyMd, notes);
}

export async function listNotes(): Promise<{ notes: NoteSummary[] }> {
  const notes = await notesStoreList();
  return { notes };
}

async function resolveNote(id: string): Promise<Note | null> {
  const direct = await notesStoreGet(id);
  if (direct) return direct;
  const serverId = await getServerId('notes', id);
  if (serverId && serverId !== id) return notesStoreGet(serverId);
  return null;
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
  const id = crypto.randomUUID();
  const wikiLinks = await wikiLinksForSave(bodyMd);
  const note = await notesStoreUpsert(id, title, bodyMd, undefined, wikiLinks, folderId ?? null);
  if (isSyncQueueEnabled()) {
    await enqueueOutbox('notes', 'create', id, { title, bodyMd, wikiLinks });
    scheduleSync();
  }
  return note;
}

export async function listFolders(): Promise<NoteFolder[]> {
  return foldersStoreList();
}

export async function createFolder(
  name: string,
  parentId?: string | null,
): Promise<NoteFolder> {
  return foldersStoreCreate(name, parentId ?? null);
}

export async function renameFolder(id: string, name: string): Promise<NoteFolder> {
  return foldersStoreRename(id, name);
}

/**
 * Walk/create folder chain under `rootParentId`.
 * Empty segments → returns `rootParentId` (no new folders).
 */
export async function ensureFolderPath(
  segments: string[],
  rootParentId: string | null = null,
): Promise<{ folderId: string | null; created: NoteFolder[] }> {
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
}

/** Deletes the folder (and descendants) and moves their notes to unfiled (local-only). */
export async function deleteFolder(id: string): Promise<string[]> {
  const deletedIds = await foldersStoreDelete(id);
  await notesStoreUnfileFolder(deletedIds);
  return deletedIds;
}

export async function moveNoteToFolder(noteId: string, folderId: string | null): Promise<void> {
  const prev = await resolveNote(noteId);
  if (!prev) throw new Error(`Note not found: ${noteId}`);
  await notesStoreSetFolderId(prev.id, folderId);
}

export async function updateNote(id: string, title: string, bodyMd: string): Promise<Note> {
  const prev = await resolveNote(id);
  if (!prev) throw new Error(`Note not found: ${id}`);
  const canonicalId = prev.id;
  const wikiLinks = await wikiLinksForSave(bodyMd);
  const note = await notesStoreUpsert(canonicalId, title, bodyMd, undefined, wikiLinks);
  await sweepOrphanAttachments(canonicalId, bodyMd);
  if (isSyncQueueEnabled()) {
    if (id !== canonicalId) await cancelOutboxForEntity('notes', id);
    await enqueueOutbox('notes', 'update', canonicalId, { title, bodyMd, wikiLinks });
    scheduleSync();
  }
  return note;
}

/** Soft-delete local attachments no longer referenced by `nordly-asset:` in body. */
async function sweepOrphanAttachments(noteId: string, bodyMd: string): Promise<void> {
  const referenced = new Set(extractNordlyAssetIds(bodyMd));
  const list = await attachmentsStoreListByNote(noteId);
  for (const attachment of list) {
    if (referenced.has(attachment.id)) continue;
    await deleteNoteAttachment(attachment.id);
  }
}

export async function openWikiLink(
  linkText: string,
): Promise<{ noteId: string; created: boolean }> {
  const trimmed = linkText.trim();
  if (!trimmed) throw new Error('Wiki link title is empty');

  const notes = await notesStoreList();
  const [resolved] = resolveWikiLinks([{ linkText: trimmed }], notes);
  if (resolved?.targetNoteId) {
    return { noteId: resolved.targetNoteId, created: false };
  }

  const note = await createNote(trimmed, '');
  return { noteId: note.id, created: true };
}

async function resolveServerNoteId(localId: string): Promise<string | null> {
  if (!isCloudEnabled() || !canUseLocalApp()) return null;
  if (!(await ensureAccessTokenForSync())) return null;
  const mapped = await getServerId('notes', localId);
  if (mapped) return mapped;
  if (isSyncEnabled()) await syncNow();
  const afterSync = await getServerId('notes', localId);
  if (afterSync) return afterSync;
  return ensureNoteServerId(localId);
}

async function mappedServerNoteId(localId: string): Promise<string | null> {
  if (!isCloudEnabled() || !canUseLocalApp()) return null;
  if (!(await ensureAccessTokenForSync())) return null;
  return getServerId('notes', localId);
}

export async function getPublishStatus(noteId: string): Promise<PublishStatus> {
  const serverId = await mappedServerNoteId(noteId);
  if (!serverId) throw new Error('Sign in required to read publish status');
  const status = await remoteGetPublishStatus(serverId);
  if (status === null) {
    await clearServerId('notes', noteId);
    return { published: false };
  }
  return status;
}

export async function countPublishedNotes(): Promise<number> {
  if (!isCloudEnabled() || !canUseLocalApp()) {
    return useFeatureUsageStore.getState().publishedNotesCount;
  }

  const notes = await notesStoreList();
  const published = await mapPool(notes, 6, async (note) => {
    const serverId = await getServerId('notes', note.id);
    if (!serverId) return false;
    return (await getPublishStatus(note.id)).published;
  });
  const count = published.filter(Boolean).length;
  useFeatureUsageStore.getState().setPublishedNotesCount(count);
  return count;
}

async function collectPublishAttachments(
  bodyMd: string,
): Promise<PublishedAttachmentInput[]> {
  const ids = extractNordlyAssetIds(bodyMd);
  const out: PublishedAttachmentInput[] = [];
  for (const id of ids) {
    let plain: Awaited<ReturnType<typeof attachmentsStoreGetPlainBytes>>;
    try {
      plain = await attachmentsStoreGetPlainBytes(id);
    } catch (err) {
      if (err instanceof AttachmentError && err.code === 'vault_locked') {
        throw new AttachmentError('vault_locked');
      }
      throw err;
    }
    if (!plain) {
      throw new AttachmentError('publish_unresolved');
    }
    out.push({
      id,
      fileName: plain.fileName,
      mime: plain.mime,
      dataB64: bytesToBase64(plain.bytes),
    });
  }
  return out;
}

export async function publishNoteToWeb(
  noteId: string,
  options: PublishToWebOptions = DEFAULT_PUBLISH_OPTIONS,
): Promise<PublishStatus> {
  const serverId = await resolveServerNoteId(noteId);
  if (!serverId) throw new Error('Sign in required to publish notes');
  return withNotesRemoteMutation(async () => {
    const note = await getNote(noteId);
    // Do not remoteUpdateNote first: published GETs would briefly serve raw
    // nordly-asset: refs, and vault notes must not push plaintext body_md.
    const attachments = await collectPublishAttachments(note.bodyMd);
    const res = await remoteShareNoteToWeb(serverId, note.bodyMd, options, attachments);
    if (!res.alreadyPublished) {
      useFeatureUsageStore.getState().adjustPublishedNotesCount(1);
    }
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
  const serverId = await mappedServerNoteId(noteId);
  if (!serverId) throw new Error('Sign in required to update published note');
  return withNotesRemoteMutation(async () => {
    const note = await getNote(noteId);
    // Share rewrites asset refs; never pre-write nordly-asset: into published body_md.
    const attachments = await collectPublishAttachments(note.bodyMd);
    await remoteShareNoteToWeb(serverId, note.bodyMd, options, attachments);
    const status = await remoteGetPublishStatus(serverId);
    if (status === null) throw new Error('Note not found on server');
    return status;
  });
}

export async function unpublishNoteFromWeb(noteId: string): Promise<void> {
  const serverId = await resolveServerNoteId(noteId);
  if (!serverId) throw new Error('Sign in required to publish notes');
  await withNotesRemoteMutation(async () => {
    const note = await getNote(noteId);
    const wikiLinks = await wikiLinksForSave(note.bodyMd);
    await remoteUnpublishNote(serverId);
    useFeatureUsageStore.getState().adjustPublishedNotesCount(-1);
    if (isVaultEnabledSync() && isVaultUnlocked()) {
      const encTitle = await encryptText(note.title);
      const encBody = await encryptText(note.bodyMd);
      await remoteMakeNotePrivate(serverId, encBody);
      await remoteUpdateNote(serverId, encTitle, encBody, wikiLinks);
    } else {
      await remoteUpdateNote(serverId, note.title, note.bodyMd, wikiLinks);
    }
  });
}

export async function deleteNote(id: string): Promise<void> {
  const prev = await resolveNote(id);
  if (!prev) throw new Error(`Note not found: ${id}`);
  const canonicalId = prev.id;
  // Local soft-delete only — server note delete cascades attachments; avoid stuck
  // attachment_delete outbox when the note was never synced.
  await deleteAttachmentsForNote(canonicalId, { syncRemote: false });
  await notesStoreSoftDelete(canonicalId);
  if (isSyncQueueEnabled()) {
    if (id !== canonicalId) await cancelOutboxForEntity('notes', id);
    await cancelOutboxForEntity('notes', canonicalId);
    await enqueueOutbox('notes', 'delete', canonicalId, {});
    scheduleSync();
  }
}

