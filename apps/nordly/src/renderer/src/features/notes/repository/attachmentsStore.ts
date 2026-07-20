import {
  dbGet,
  dbGetAllByIndex,
  dbPut,
  entityKey,
  requireUserId,
} from '@shared/db/nordlyDb';
import { decryptBytes, encryptBytes, isVaultUnlocked } from '@shared/crypto/vault';
import { isVaultEnabledSync } from '@shared/crypto/vaultPrefs';
import { shouldAcceptRemoteEntity } from '@shared/sync/tombstone';

import {
  AttachmentError,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_NOTE,
  base64ToBytes,
  bytesToBase64,
  isAllowedImageMime,
} from '../lib/noteAttachments';

export interface StoredAttachment {
  key: string;
  userId: string;
  id: string;
  noteId: string;
  fileName: string;
  mime: string;
  /** Base64 plaintext or ciphertext depending on atRestEncrypted. */
  dataB64: string;
  atRestEncrypted: boolean;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
}

export interface NoteAttachment {
  id: string;
  noteId: string;
  fileName: string;
  mime: string;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
  /** True when vault holds ciphertext and vault is locked. */
  vaultLocked?: boolean;
}

function rowToMeta(row: StoredAttachment, vaultLocked?: boolean): NoteAttachment {
  return {
    id: row.id,
    noteId: row.noteId,
    fileName: row.fileName,
    mime: row.mime,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    vaultLocked,
  };
}

export async function attachmentsStoreListByNote(
  noteId: string,
  userId?: string,
): Promise<NoteAttachment[]> {
  const uid = userId ?? requireUserId();
  const rows = await dbGetAllByIndex<StoredAttachment>(
    'note_attachments',
    'userId_noteId',
    [uid, noteId],
  );
  return rows
    .filter((r) => !r.deleted)
    .map((r) =>
      rowToMeta(r, r.atRestEncrypted && !isVaultUnlocked() ? true : undefined),
    );
}

export async function attachmentsStoreCountByNote(
  noteId: string,
  userId?: string,
): Promise<number> {
  const list = await attachmentsStoreListByNote(noteId, userId);
  return list.length;
}

export async function attachmentsStoreGetRow(
  id: string,
  userId?: string,
): Promise<StoredAttachment | null> {
  const row = await attachmentsStoreGetRowIncludingDeleted(id, userId);
  if (!row || row.deleted) return null;
  return row;
}

/** Includes soft-deleted rows (tombstones) for sync push/delete. */
export async function attachmentsStoreGetRowIncludingDeleted(
  id: string,
  userId?: string,
): Promise<StoredAttachment | null> {
  const uid = userId ?? requireUserId();
  return dbGet<StoredAttachment>('note_attachments', entityKey(id, uid));
}

/** Decrypt if needed; returns plaintext bytes. */
export async function attachmentsStoreGetPlainBytes(
  id: string,
  userId?: string,
): Promise<{ bytes: Uint8Array; mime: string; fileName: string } | null> {
  const row = await attachmentsStoreGetRow(id, userId);
  if (!row) return null;
  if (row.atRestEncrypted) {
    if (!isVaultUnlocked()) {
      throw new AttachmentError('vault_locked');
    }
    const bytes = await decryptBytes(row.dataB64);
    return { bytes, mime: row.mime, fileName: row.fileName };
  }
  return {
    bytes: base64ToBytes(row.dataB64),
    mime: row.mime,
    fileName: row.fileName,
  };
}

export async function attachmentsStoreUpsert(input: {
  id: string;
  noteId: string;
  fileName: string;
  mime: string;
  bytes: Uint8Array;
  userId?: string;
}): Promise<NoteAttachment> {
  const uid = input.userId ?? requireUserId();
  if (!isAllowedImageMime(input.mime)) {
    throw new AttachmentError('bad_type');
  }
  if (input.bytes.byteLength > MAX_ATTACHMENT_BYTES) {
    throw new AttachmentError('too_large');
  }

  const existing = await attachmentsStoreGetRow(input.id, uid);
  if (!existing) {
    const count = await attachmentsStoreCountByNote(input.noteId, uid);
    if (count >= MAX_ATTACHMENTS_PER_NOTE) {
      throw new AttachmentError('too_many');
    }
  } else if (existing.noteId !== input.noteId) {
    throw new Error(`Attachment ${input.id} belongs to another note`);
  }

  const now = new Date().toISOString();
  const vaultOn = isVaultEnabledSync();
  let dataB64: string;
  let atRestEncrypted = false;
  if (vaultOn) {
    if (!isVaultUnlocked()) throw new AttachmentError('vault_locked');
    dataB64 = await encryptBytes(input.bytes);
    atRestEncrypted = true;
  } else {
    dataB64 = bytesToBase64(input.bytes);
  }

  const row: StoredAttachment = {
    key: entityKey(input.id, uid),
    userId: uid,
    id: input.id,
    noteId: input.noteId,
    fileName: input.fileName,
    mime: input.mime,
    dataB64,
    atRestEncrypted,
    sizeBytes: input.bytes.byteLength,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await dbPut('note_attachments', row);
  return rowToMeta(row);
}

/** Store remote/sync row as-is (already ciphertext or plaintext b64). Honors local tombstones. */
export async function attachmentsStorePutWire(row: {
  id: string;
  noteId: string;
  fileName: string;
  mime: string;
  dataB64: string;
  encrypted: boolean;
  sizeBytes: number;
  createdAt?: string;
  updatedAt: string;
  userId?: string;
}): Promise<void> {
  const uid = row.userId ?? requireUserId();
  const existing = await attachmentsStoreGetRowIncludingDeleted(row.id, uid);
  if (!shouldAcceptRemoteEntity(existing, row.updatedAt)) {
    return;
  }
  const now = new Date().toISOString();
  await dbPut('note_attachments', {
    key: entityKey(row.id, uid),
    userId: uid,
    id: row.id,
    noteId: row.noteId,
    fileName: row.fileName,
    mime: row.mime,
    dataB64: row.dataB64,
    atRestEncrypted: row.encrypted,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt ?? existing?.createdAt ?? now,
    updatedAt: row.updatedAt,
  } satisfies StoredAttachment);
}

export async function attachmentsStoreSoftDelete(
  id: string,
  userId?: string,
): Promise<void> {
  const uid = userId ?? requireUserId();
  const existing = await dbGet<StoredAttachment>('note_attachments', entityKey(id, uid));
  if (!existing) return;
  await dbPut('note_attachments', {
    ...existing,
    deleted: true,
    updatedAt: new Date().toISOString(),
  });
}

export async function attachmentsStoreDeleteForNote(
  noteId: string,
  userId?: string,
): Promise<string[]> {
  const uid = userId ?? requireUserId();
  const rows = await dbGetAllByIndex<StoredAttachment>(
    'note_attachments',
    'userId_noteId',
    [uid, noteId],
  );
  const ids: string[] = [];
  for (const row of rows) {
    if (row.deleted) continue;
    ids.push(row.id);
    await dbPut('note_attachments', {
      ...row,
      deleted: true,
      updatedAt: new Date().toISOString(),
    });
  }
  return ids;
}

/** After local→server note id replace, keep attachments keyed to the active note id. */
export async function attachmentsStoreRemapNoteId(
  oldNoteId: string,
  newNoteId: string,
  userId?: string,
): Promise<number> {
  if (oldNoteId === newNoteId) return 0;
  const uid = userId ?? requireUserId();
  const rows = await dbGetAllByIndex<StoredAttachment>(
    'note_attachments',
    'userId_noteId',
    [uid, oldNoteId],
  );
  let n = 0;
  for (const row of rows) {
    await dbPut('note_attachments', { ...row, noteId: newNoteId });
    n += 1;
  }
  return n;
}
