import {
  attachmentsStoreDeleteForNote,
  attachmentsStoreGetPlainBytes,
  attachmentsStoreGetRow,
  attachmentsStoreListByNote,
  attachmentsStoreSoftDelete,
  attachmentsStoreUpsert,
  type NoteAttachment,
} from '@features/notes/repository/attachmentsStore';
import {
  AttachmentError,
  markdownImage,
  mimeFromFilename,
  nordlyAssetHref,
} from '@features/notes/lib/noteAttachments';
import { enqueueOutbox, enqueueOutboxOnce, removeOutboxForEntity } from '@shared/sync/outbox';
import { scheduleSync } from '@shared/sync/SyncEngine';
import { isSyncQueueEnabled } from '@shared/sync/syncConfig';
import { isVaultEnabledSync } from '@shared/crypto/vaultPrefs';
import { isVaultUnlocked } from '@shared/crypto/vault';

export type { NoteAttachment };

const blobUrlCache = new Map<string, string>();

export function revokeAttachmentBlobUrl(id: string): void {
  const url = blobUrlCache.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    blobUrlCache.delete(id);
  }
}

export async function listNoteAttachments(noteId: string): Promise<NoteAttachment[]> {
  return attachmentsStoreListByNote(noteId);
}

/** Resolve plaintext image for preview; returns object URL (cached). */
export async function resolveAttachmentObjectUrl(id: string): Promise<string | null> {
  const cached = blobUrlCache.get(id);
  if (cached) return cached;
  try {
    const plain = await attachmentsStoreGetPlainBytes(id);
    if (!plain) return null;
    const blob = new Blob([new Uint8Array(plain.bytes)], { type: plain.mime });
    const url = URL.createObjectURL(blob);
    blobUrlCache.set(id, url);
    return url;
  } catch (err) {
    if (err instanceof AttachmentError && err.code === 'vault_locked') return null;
    throw err;
  }
}

export async function createNoteAttachment(
  noteId: string,
  fileName: string,
  mime: string,
  bytes: Uint8Array,
  id?: string,
): Promise<{ attachment: NoteAttachment; markdown: string }> {
  const attachmentId = id ?? crypto.randomUUID();
  const resolvedMime = mime || mimeFromFilename(fileName) || '';
  const attachment = await attachmentsStoreUpsert({
    id: attachmentId,
    noteId,
    fileName,
    mime: resolvedMime,
    bytes,
  });
  revokeAttachmentBlobUrl(attachmentId);

  if (isSyncQueueEnabled()) {
    await removeOutboxForEntity('notes', attachmentId, 'attachment_delete');
    await enqueueOutbox('notes', 'attachment_put', attachmentId, { noteId });
    scheduleSync();
  }

  const alt = fileName.replace(/\.[^.]+$/, '') || 'image';
  return {
    attachment,
    markdown: markdownImage(alt, nordlyAssetHref(attachmentId)),
  };
}

export async function createNoteAttachmentFromFile(
  noteId: string,
  file: File,
): Promise<{ attachment: NoteAttachment; markdown: string }> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const mime = file.type || mimeFromFilename(file.name) || '';
  return createNoteAttachment(noteId, file.name, mime, buf);
}

export async function deleteNoteAttachment(id: string): Promise<void> {
  revokeAttachmentBlobUrl(id);
  const row = await attachmentsStoreGetRow(id);
  const noteId = row?.noteId;
  await attachmentsStoreSoftDelete(id);
  if (isSyncQueueEnabled() && noteId) {
    await removeOutboxForEntity('notes', id, 'attachment_put');
    await enqueueOutboxOnce('notes', 'attachment_delete', id, { noteId });
    scheduleSync();
  }
}

/**
 * Soft-delete all attachments for a note.
 * When `syncRemote` is false (note delete), skip attachment_delete outbox —
 * server cascades on note archive; avoids stuck deletes for never-synced notes.
 */
export async function deleteAttachmentsForNote(
  noteId: string,
  opts?: { syncRemote?: boolean },
): Promise<void> {
  const syncRemote = opts?.syncRemote !== false;
  const ids = await attachmentsStoreDeleteForNote(noteId);
  for (const id of ids) {
    revokeAttachmentBlobUrl(id);
    if (isSyncQueueEnabled()) {
      await removeOutboxForEntity('notes', id);
      if (syncRemote) {
        await enqueueOutboxOnce('notes', 'attachment_delete', id, { noteId });
      }
    }
  }
  if (ids.length > 0 && syncRemote && isSyncQueueEnabled()) scheduleSync();
}

/** Wire payload for sync push — ciphertext if vault on. */
export async function getAttachmentSyncPayload(id: string): Promise<{
  noteId: string;
  fileName: string;
  mime: string;
  dataB64: string;
  encrypted: boolean;
  sizeBytes: number;
} | null> {
  const row = await attachmentsStoreGetRow(id);
  if (!row) return null;
  return {
    noteId: row.noteId,
    fileName: row.fileName,
    mime: row.mime,
    dataB64: row.dataB64,
    encrypted: row.atRestEncrypted,
    sizeBytes: row.sizeBytes,
  };
}

export function canDecryptAttachments(): boolean {
  return !isVaultEnabledSync() || isVaultUnlocked();
}
