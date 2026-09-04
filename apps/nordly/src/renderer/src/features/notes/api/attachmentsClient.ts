import {
  attachmentsStoreDeleteForNote,
  attachmentsStoreGetPlainBytes,
  attachmentsStoreGetRow,
  attachmentsStoreSoftDelete,
  attachmentsStoreUpsert,
  type NoteAttachment,
} from '@features/notes/repository/attachmentsStore';
import {
  AttachmentError,
  isAllowedImageMime,
  markdownImage,
  mimeFromFilename,
  nordlyAssetHref,
} from '@features/notes/lib/noteAttachments';
import { enqueueOutbox, enqueueOutboxOnce, removeOutboxForEntity } from '@shared/sync/outbox';
import { OutboxOp, SyncDomain } from '@shared/sync/types';
import { scheduleSync } from '@shared/sync/SyncEngine';
import { isSyncQueueEnabled } from '@shared/sync/syncConfig';
import {
  createVaultPastedImageMarkdown,
  isNotesVaultBound,
} from '@features/notes/vault';

export type { NoteAttachment };

const blobUrlCache = new Map<string, string>();

export function revokeAttachmentBlobUrl(id: string): void {
  const url = blobUrlCache.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    blobUrlCache.delete(id);
  }
}

/** Resolve plaintext image for preview; returns object URL (cached). */
export async function resolveAttachmentObjectUrl(id: string): Promise<string | null> {
  const cached = blobUrlCache.get(id);
  if (cached) return cached;
  const plain = await attachmentsStoreGetPlainBytes(id);
  if (!plain) return null;
  const blob = new Blob([new Uint8Array(plain.bytes)], { type: plain.mime });
  const url = URL.createObjectURL(blob);
  blobUrlCache.set(id, url);
  return url;
}

export async function createNoteAttachment(
  noteId: string,
  fileName: string,
  mime: string,
  bytes: Uint8Array,
  id?: string,
): Promise<{ attachment: NoteAttachment; markdown: string }> {
  if (await isNotesVaultBound()) {
    const file = new File([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], fileName, { type: mime });
    const markdown = await createVaultPastedImageMarkdown(noteId, file);
    const attachment: NoteAttachment = {
      id: `vault:${fileName}`,
      noteId,
      fileName,
      mime: (mime || mimeFromFilename(fileName) || 'application/octet-stream').toLowerCase(),
      sizeBytes: bytes.byteLength,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return { attachment, markdown };
  }

  const attachmentId = id ?? crypto.randomUUID();
  const resolvedMime = (mime || mimeFromFilename(fileName) || '').toLowerCase();
  if (!resolvedMime || !isAllowedImageMime(resolvedMime)) {
    throw new AttachmentError('bad_type', `unsupported image type: ${resolvedMime || fileName}`);
  }
  const attachment = await attachmentsStoreUpsert({
    id: attachmentId,
    noteId,
    fileName,
    mime: resolvedMime,
    bytes,
  });
  revokeAttachmentBlobUrl(attachmentId);

  if (isSyncQueueEnabled()) {
    await removeOutboxForEntity(SyncDomain.Notes, attachmentId, OutboxOp.AttachmentDelete);
    await enqueueOutbox(SyncDomain.Notes, OutboxOp.AttachmentPut, attachmentId, { noteId });
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
  if (await isNotesVaultBound()) {
    const markdown = await createVaultPastedImageMarkdown(noteId, file);
    const mime = (file.type || mimeFromFilename(file.name) || 'application/octet-stream').toLowerCase();
    const attachment: NoteAttachment = {
      id: `vault:${file.name}`,
      noteId,
      fileName: file.name,
      mime,
      sizeBytes: file.size,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return { attachment, markdown };
  }
  const buf = new Uint8Array(await file.arrayBuffer());
  const mime = file.type || mimeFromFilename(file.name) || '';
  return createNoteAttachment(noteId, file.name, mime, buf);
}

export async function deleteNoteAttachment(id: string): Promise<void> {
  if (id.startsWith('vault:') || (await isNotesVaultBound())) {
    // Vault attachments are ordinary files; orphans cleaned when body no longer references them.
    return;
  }
  revokeAttachmentBlobUrl(id);
  const row = await attachmentsStoreGetRow(id);
  const noteId = row?.noteId;
  await attachmentsStoreSoftDelete(id);
  if (isSyncQueueEnabled() && noteId) {
    await removeOutboxForEntity(SyncDomain.Notes, id, OutboxOp.AttachmentPut);
    await enqueueOutboxOnce(SyncDomain.Notes, OutboxOp.AttachmentDelete, id, { noteId });
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
  if (await isNotesVaultBound()) return;
  const syncRemote = opts?.syncRemote !== false;
  const ids = await attachmentsStoreDeleteForNote(noteId);
  for (const id of ids) {
    revokeAttachmentBlobUrl(id);
    if (isSyncQueueEnabled()) {
      await removeOutboxForEntity(SyncDomain.Notes, id);
      if (syncRemote) {
        await enqueueOutboxOnce(SyncDomain.Notes, OutboxOp.AttachmentDelete, id, { noteId });
      }
    }
  }
  if (ids.length > 0 && syncRemote && isSyncQueueEnabled()) scheduleSync();
}
