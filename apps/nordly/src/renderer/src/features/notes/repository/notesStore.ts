import {
  dbDelete,
  dbGet,
  dbGetAllByUser,
  dbPut,
  entityKey,
  requireUserId,
} from '@shared/db/nordlyDb';
import { isVaultUnlocked } from '@shared/crypto/vault';
import { isVaultEnabledSync } from '@shared/crypto/vaultPrefs';
import { getServerId, setServerId } from '@shared/sync/idMap';
import {
  shouldAcceptRemoteEntity,
  syncedIdsAbsentFromRemote,
} from '@shared/sync/tombstone';

import { decryptNoteFields, encryptNoteFields } from '../crypto/noteCrypto';
import type { Note, NoteSummary } from '../api/notesClient';
import type { WikiLinkWire } from '../lib/wikiLinks';
import { foldersStoreList } from './foldersStore';

export type StoredWikiLink = WikiLinkWire;

export interface StoredNote {
  userId: string;
  id: string;
  key: string;
  title: string;
  bodyMd: string;
  createdAt: string;
  updatedAt: string;
  deleted: boolean;
  /** Plaintext fields encrypted at rest in IndexedDB. */
  atRestEncrypted?: boolean;
  /** Outgoing wiki-link metadata (plaintext). */
  wikiLinks?: StoredWikiLink[];
  /**
   * Local folder assignment (device-only). Not synced — preserved on remote merge
   * like task `order`.
   */
  folderId?: string | null;
}

function parseTs(raw: string | undefined): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function bodySize(bodyMd: string): number {
  return new TextEncoder().encode(bodyMd).length;
}

function toNote(row: StoredNote & { vaultLocked?: boolean }): Note {
  return {
    id: row.id,
    title: row.title,
    bodyMd: row.bodyMd,
    createdAt: parseTs(row.createdAt),
    updatedAt: parseTs(row.updatedAt),
    sizeBytes: bodySize(row.bodyMd),
    vaultLocked: row.vaultLocked,
    folderId: row.folderId ?? null,
  };
}

function toSummary(row: StoredNote & { vaultLocked?: boolean }): NoteSummary {
  return {
    id: row.id,
    title: row.title,
    updatedAt: parseTs(row.updatedAt),
    sizeBytes: bodySize(row.bodyMd),
    vaultLocked: row.vaultLocked,
    folderId: row.folderId ?? null,
  };
}

function rowFrom(userId: string, partial: Omit<StoredNote, 'key' | 'userId'>): StoredNote {
  return { ...partial, userId, key: entityKey(partial.id, userId) };
}

async function encryptAtRest(
  userId: string,
  partial: Omit<StoredNote, 'key' | 'userId' | 'atRestEncrypted'>,
): Promise<StoredNote> {
  const base = rowFrom(userId, partial);
  if (!isVaultEnabledSync()) {
    return { ...base, atRestEncrypted: false };
  }
  if (!isVaultUnlocked()) {
    throw new Error('Vault locked — plaintext note writes are disabled');
  }
  const { encTitle, encBody } = await encryptNoteFields(partial.title, partial.bodyMd);
  return {
    ...base,
    title: encTitle,
    bodyMd: encBody,
    atRestEncrypted: true,
  };
}

async function decryptAtRest(row: StoredNote): Promise<StoredNote & { vaultLocked?: boolean }> {
  if (!row.atRestEncrypted) return row;
  if (!isVaultEnabledSync() || !isVaultUnlocked()) {
    return { ...row, title: '', bodyMd: '', vaultLocked: true };
  }
  const { title, bodyMd } = await decryptNoteFields(row.title, row.bodyMd);
  return { ...row, title, bodyMd, vaultLocked: false };
}

export async function notesStoreList(userId?: string): Promise<NoteSummary[]> {
  const uid = userId ?? requireUserId();
  const rows = await dbGetAllByUser<StoredNote>('notes', uid);
  const out: NoteSummary[] = [];
  for (const row of rows) {
    if (row.deleted) continue;
    out.push(toSummary(await decryptAtRest(row)));
  }
  return out.sort(
    (a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0),
  );
}

export async function notesStoreGet(id: string, userId?: string): Promise<Note | null> {
  const row = await notesStoreGetRow(id, userId);
  if (!row || row.deleted) return null;
  return toNote(await decryptAtRest(row));
}

/** Raw row for sync — includes soft-deleted tombstones. */
export async function notesStoreGetRow(id: string, userId?: string): Promise<StoredNote | null> {
  const uid = userId ?? requireUserId();
  return dbGet<StoredNote>('notes', entityKey(id, uid));
}

export async function notesStorePut(note: StoredNote): Promise<void> {
  const enc = await encryptAtRest(note.userId, note);
  await dbPut('notes', enc);
}

export async function notesStoreUpsert(
  id: string,
  title: string,
  bodyMd: string,
  timestamps?: { createdAt?: string; updatedAt?: string },
  wikiLinks?: StoredWikiLink[],
  /** `undefined` keeps existing; `null` clears; string assigns. */
  folderId?: string | null,
): Promise<Note> {
  const userId = requireUserId();
  const existing = await dbGet<StoredNote>('notes', entityKey(id, userId));
  if (existing?.deleted) {
    throw new Error(`Cannot update deleted note: ${id}`);
  }
  const now = new Date().toISOString();
  // Re-read device folderId right before write — concurrent setFolderId must win.
  let nextFolderId = folderId;
  if (folderId === undefined) {
    const latest = await dbGet<StoredNote>('notes', entityKey(id, userId));
    nextFolderId = latest?.folderId ?? existing?.folderId ?? null;
  }
  if (typeof nextFolderId === 'string') {
    const folders = await foldersStoreList(userId);
    if (!folders.some((f) => f.id === nextFolderId)) {
      throw new Error(`Folder not found: ${nextFolderId}`);
    }
  }
  const row = await encryptAtRest(userId, {
    id,
    title,
    bodyMd,
    createdAt: timestamps?.createdAt ?? existing?.createdAt ?? now,
    updatedAt: timestamps?.updatedAt ?? now,
    deleted: false,
    wikiLinks: wikiLinks ?? existing?.wikiLinks,
    folderId: nextFolderId ?? null,
  });
  await dbPut('notes', row);
  return toNote(await decryptAtRest(row));
}

/** Device-only folder move — does not bump `updatedAt` (avoids LWW fights with sync). */
export async function notesStoreSetFolderId(
  id: string,
  folderId: string | null,
): Promise<void> {
  const userId = requireUserId();
  if (folderId != null) {
    const folders = await foldersStoreList(userId);
    if (!folders.some((f) => f.id === folderId)) {
      throw new Error(`Folder not found: ${folderId}`);
    }
  }
  const existing = await dbGet<StoredNote>('notes', entityKey(id, userId));
  if (!existing || existing.deleted) {
    throw new Error(`Note not found: ${id}`);
  }
  await dbPut('notes', {
    ...existing,
    folderId,
  });
}

/** Note ids that currently live in any of the given folders (non-deleted). */
export async function notesStoreIdsInFolders(
  folderId: string | string[],
  userId?: string,
): Promise<string[]> {
  const uid = userId ?? requireUserId();
  const ids = new Set(Array.isArray(folderId) ? folderId : [folderId]);
  if (ids.size === 0) return [];
  const rows = await dbGetAllByUser<StoredNote>('notes', uid);
  const out: string[] = [];
  for (const row of rows) {
    if (row.deleted || !row.folderId || !ids.has(row.folderId)) continue;
    out.push(row.id);
  }
  return out;
}

export async function notesStoreSoftDelete(id: string): Promise<void> {
  const userId = requireUserId();
  const existing = await dbGet<StoredNote>('notes', entityKey(id, userId));
  if (!existing) return;
  await dbPut('notes', {
    ...existing,
    deleted: true,
    updatedAt: new Date().toISOString(),
  });
}

export async function notesStoreMergeRemote(remote: StoredNote): Promise<void> {
  if (typeof remote.deleted !== 'boolean') {
    throw new Error(`Invalid remote note: missing deleted (${remote.id})`);
  }
  const userId = requireUserId();
  const local = await dbGet<StoredNote>('notes', entityKey(remote.id, userId));
  if (!shouldAcceptRemoteEntity(local, remote.updatedAt)) return;
  const rt = new Date(remote.updatedAt).getTime();
  const lt = local ? new Date(local.updatedAt).getTime() : 0;
  if (!local || rt >= lt) {
    // Fresh folderId read — concurrent move/unfile must not be overwritten.
    const latest = await dbGet<StoredNote>('notes', entityKey(remote.id, userId));
    const row = await encryptAtRest(userId, {
      id: remote.id,
      title: remote.title,
      bodyMd: remote.bodyMd,
      createdAt: remote.createdAt,
      updatedAt: remote.updatedAt,
      deleted: remote.deleted,
      wikiLinks: remote.wikiLinks ?? local?.wikiLinks,
      folderId: latest?.folderId ?? local?.folderId ?? null,
    });
    await dbPut('notes', row);
  }
  await setServerId('notes', remote.id, remote.id, userId);
}

export async function notesStoreBulkImport(
  userId: string,
  records: Record<string, Omit<StoredNote, 'key' | 'userId'>>,
): Promise<void> {
  for (const row of Object.values(records)) {
    const encrypted = await encryptAtRest(userId, {
      ...row,
      deleted: false,
    });
    await dbPut('notes', encrypted);
  }
}

export async function notesStoreAll(userId?: string): Promise<StoredNote[]> {
  const uid = userId ?? requireUserId();
  return dbGetAllByUser<StoredNote>('notes', uid);
}

export async function notesStoreReplaceId(oldId: string, note: Note): Promise<void> {
  const userId = requireUserId();
  const existing = await dbGet<StoredNote>('notes', entityKey(oldId, userId));
  const wasDeleted = Boolean(existing?.deleted);
  if (wasDeleted) {
    // Preserve the local tombstone under its original id. The id map lets the
    // queued delete target a server note created just before the local delete.
    return;
  }
  await dbDelete('notes', entityKey(oldId, userId));
  const now = new Date().toISOString();
  const row = await encryptAtRest(userId, {
    id: note.id,
    title: note.title,
    bodyMd: note.bodyMd,
    createdAt: note.createdAt?.toISOString() ?? now,
    updatedAt: note.updatedAt?.toISOString() ?? now,
    deleted: false,
    wikiLinks: existing?.wikiLinks,
    folderId: existing?.folderId ?? note.folderId ?? null,
  });
  await dbPut('notes', row);
}

/** Soft-delete previously synced locals that no longer appear on the server. */
export async function notesStoreApplyRemoteAbsences(
  remoteIds: Set<string>,
  userId?: string,
): Promise<string[]> {
  const uid = userId ?? requireUserId();
  const rows = await dbGetAllByUser<StoredNote>('notes', uid);
  const candidates: { id: string; serverId: string | null }[] = [];
  for (const row of rows) {
    if (row.deleted) continue;
    const serverId = await getServerId('notes', row.id, uid);
    candidates.push({ id: row.id, serverId });
  }
  const absent = syncedIdsAbsentFromRemote(candidates, remoteIds);
  for (const id of absent) {
    await notesStoreSoftDelete(id);
  }
  return absent;
}

export { toNote, toSummary, rowFrom, decryptAtRest };
