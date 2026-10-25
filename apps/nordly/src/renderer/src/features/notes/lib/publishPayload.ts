import { AttachmentError, extractNordlyAssetIds } from './noteAttachments';
import { bytesToBase64 } from '@shared/lib/base64';
import { attachmentsStoreGetPlainBytes } from '../repository/attachmentsStore';
import { readVaultImageBytes } from '../vault/resolveVaultImage';
import { applyPublishImageRewrites, findLocalPublishImages } from './publishImages';
import { isNotesVaultBound } from '../vault';
import type { PublishedAttachmentInput } from '../remote/publishRemote';

async function collectNordlyAssetAttachments(bodyMd: string): Promise<PublishedAttachmentInput[]> {
  const out: PublishedAttachmentInput[] = [];
  const ids = extractNordlyAssetIds(bodyMd);
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

async function collectVaultPublishImages(
  noteId: string,
  bodyMd: string,
): Promise<{ body: string; attachments: PublishedAttachmentInput[] }> {
  const spans = findLocalPublishImages(bodyMd);
  if (spans.length === 0) return { body: bodyMd, attachments: [] };
  if (!(await isNotesVaultBound())) {
    throw new AttachmentError('publish_unresolved');
  }
  const assetIds = new Map<string, string>();
  const attachments: PublishedAttachmentInput[] = [];
  for (const span of spans) {
    if (assetIds.has(span.href)) continue;
    let image: Awaited<ReturnType<typeof readVaultImageBytes>>;
    try {
      image = await readVaultImageBytes(span.href, noteId);
    } catch (err) {
      if (err instanceof AttachmentError && (err.code === 'too_large' || err.code === 'vault_locked')) {
        throw err;
      }
      throw new AttachmentError('publish_unresolved', span.href);
    }
    const id = crypto.randomUUID();
    assetIds.set(span.href, id);
    attachments.push({
      id,
      fileName: image.fileName,
      mime: image.mime,
      dataB64: bytesToBase64(image.bytes),
    });
  }
  return { body: applyPublishImageRewrites(bodyMd, spans, assetIds), attachments };
}

export async function collectPublishPayload(
  noteId: string,
  bodyMd: string,
): Promise<{ body: string; attachments: PublishedAttachmentInput[] }> {
  const vault = await collectVaultPublishImages(noteId, bodyMd);
  const assets = await collectNordlyAssetAttachments(bodyMd);
  return { body: vault.body, attachments: [...assets, ...vault.attachments] };
}

