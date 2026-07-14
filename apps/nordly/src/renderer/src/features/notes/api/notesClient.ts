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
import { ensureNoteServerId } from '@features/notes/sync/notesSync';
import { isCloudApiAvailable, isSyncEnabled } from '@shared/sync/syncConfig';
import { useFeatureUsageStore } from '@shared/model/featureUsage';

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
  if (isSyncEnabled()) {
    await enqueueOutbox('notes', 'create', id, { title, bodyMd, wikiLinks });
    scheduleSync();
  }
  return note;
}

export async function listFolders(): Promise<NoteFolder[]> {
  return foldersStoreList();
}

export async function createFolder(name: string): Promise<NoteFolder> {
  return foldersStoreCreate(name);
}

export async function renameFolder(id: string, name: string): Promise<NoteFolder> {
  return foldersStoreRename(id, name);
}

/** Deletes the folder and moves its notes to unfiled (local-only). */
export async function deleteFolder(id: string): Promise<void> {
  await notesStoreUnfileFolder(id);
  await foldersStoreDelete(id);
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
  if (isSyncEnabled()) {
    if (id !== canonicalId) await cancelOutboxForEntity('notes', id);
    await enqueueOutbox('notes', 'update', canonicalId, { title, bodyMd, wikiLinks });
    scheduleSync();
  }
  return note;
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
  if (!isCloudApiAvailable()) return null;
  if (!(await ensureAccessTokenForSync())) return null;
  const mapped = await getServerId('notes', localId);
  if (mapped) return mapped;
  if (isSyncEnabled()) await syncNow();
  const afterSync = await getServerId('notes', localId);
  if (afterSync) return afterSync;
  return ensureNoteServerId(localId);
}

async function mappedServerNoteId(localId: string): Promise<string | null> {
  if (!isCloudApiAvailable()) return null;
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

export async function publishNoteToWeb(
  noteId: string,
  options: PublishToWebOptions = DEFAULT_PUBLISH_OPTIONS,
): Promise<PublishStatus> {
  const serverId = await resolveServerNoteId(noteId);
  if (!serverId) throw new Error('Sign in required to publish notes');
  const note = await getNote(noteId);
  const wikiLinks = await wikiLinksForSave(note.bodyMd);
  await remoteUpdateNote(serverId, note.title, note.bodyMd, wikiLinks);
  const res = await remoteShareNoteToWeb(serverId, note.bodyMd, options);
  if (!res.alreadyPublished) {
    useFeatureUsageStore.getState().adjustPublishedNotesCount(1);
  }
  const status = await remoteGetPublishStatus(serverId);
  if (status === null) throw new Error('Note not found on server');
  return status;
}

/** Update publish options / body on an already-published note — no full sync pass. */
export async function updatePublishedNoteOptions(
  noteId: string,
  options: PublishToWebOptions,
): Promise<PublishStatus> {
  const serverId = await mappedServerNoteId(noteId);
  if (!serverId) throw new Error('Sign in required to update published note');
  const note = await getNote(noteId);
  const wikiLinks = await wikiLinksForSave(note.bodyMd);
  await remoteUpdateNote(serverId, note.title, note.bodyMd, wikiLinks);
  await remoteShareNoteToWeb(serverId, note.bodyMd, options);
  const status = await remoteGetPublishStatus(serverId);
  if (status === null) throw new Error('Note not found on server');
  return status;
}

export async function unpublishNoteFromWeb(noteId: string): Promise<void> {
  const serverId = await resolveServerNoteId(noteId);
  if (!serverId) throw new Error('Sign in required to publish notes');
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
}

export async function deleteNote(id: string): Promise<void> {
  const prev = await resolveNote(id);
  if (!prev) throw new Error(`Note not found: ${id}`);
  const canonicalId = prev.id;
  await notesStoreSoftDelete(canonicalId);
  if (isSyncEnabled()) {
    if (id !== canonicalId) await cancelOutboxForEntity('notes', id);
    await cancelOutboxForEntity('notes', canonicalId);
    await enqueueOutbox('notes', 'delete', canonicalId, {});
    scheduleSync();
  }
}
