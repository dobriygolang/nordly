/** Resolve relative / vault image hrefs to object URLs for live preview. */

import { parseNordlyAssetId } from '@shared/lib/nordlyAsset';
import {
  AttachmentError,
  isAllowedImageMime,
  markdownImage,
  mimeFromFilename,
} from '@features/notes/lib/noteAttachments';
import { attachmentsStoreGetPlainBytes } from '@features/notes/repository/attachmentsStore';

import {
  vaultGetConfig,
  vaultReadBytes,
  vaultFindImage,
  vaultWritePastedImage,
} from './ipc';
import { withVaultNotePathMutation } from './vaultIo';
import { enqueueVaultFilePut, suppressVaultWatch } from './vaultOutbox';

const blobCache = new Map<string, string>();
const assetBlobCache = new Map<string, string>();

function decodeHrefPath(href: string): string {
  return href
    .split('/')
    .map((seg) => {
      try {
        return decodeURIComponent(seg);
      } catch {
        return seg;
      }
    })
    .join('/');
}

export function joinNoteRelative(notePath: string, href: string): string {
  const decoded = decodeHrefPath(href.replace(/^\.\//, ''));
  if (decoded.startsWith('/')) {
    return decoded.replace(/^\/+/, '');
  }
  const noteDir = notePath.includes('/') ? notePath.slice(0, notePath.lastIndexOf('/')) : '';
  const parts = noteDir ? noteDir.split('/') : [];
  for (const seg of decoded.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      parts.pop();
      continue;
    }
    parts.push(seg);
  }
  return parts.join('/');
}

export function revokeVaultImageCache(): void {
  for (const url of blobCache.values()) {
    URL.revokeObjectURL(url);
  }
  blobCache.clear();
  for (const url of assetBlobCache.values()) {
    URL.revokeObjectURL(url);
  }
  assetBlobCache.clear();
}

async function resolveLegacyAssetUrl(id: string): Promise<string | null> {
  const cached = assetBlobCache.get(id);
  if (cached) return cached;
  const plain = await attachmentsStoreGetPlainBytes(id);
  if (!plain) return null;
  const url = URL.createObjectURL(new Blob([new Uint8Array(plain.bytes)], { type: plain.mime }));
  assetBlobCache.set(id, url);
  return url;
}

/**
 * Resolve markdown image href for vault notes.
 * Supports https, leftover nordly-asset:, and relative vault paths.
 */
function imageReadError(err: unknown): AttachmentError {
  if (err instanceof AttachmentError) return err;
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  if (lower.includes('5 mib') || lower.includes('exceeds')) return new AttachmentError('too_large');
  if (lower.includes('unsupported image')) return new AttachmentError('bad_type');
  if (lower.includes('vault_locked')) return new AttachmentError('vault_locked');
  return new AttachmentError('missing', message);
}

async function readRelBytes(rel: string): Promise<{ bytes: Uint8Array; mime: string }> {
  const mime = mimeFromFilename(rel);
  if (!mime || !isAllowedImageMime(mime)) throw new AttachmentError('bad_type', rel);
  try {
    return { bytes: await vaultReadBytes(rel), mime };
  } catch (err) {
    throw imageReadError(err);
  }
}

async function resolveVaultImageRel(href: string, notePath: string): Promise<string> {
  const cfg = await vaultGetConfig();
  if (!cfg) throw new AttachmentError('missing', href);
  const rel = joinNoteRelative(notePath, href);
  if (!rel || rel.split('/').includes('..')) throw new AttachmentError('missing', href);
  try {
    await readRelBytes(rel);
    return rel;
  } catch (err) {
    if (!(err instanceof AttachmentError) || err.code !== 'missing') throw err;
    if (href.includes('/') || href.includes('\\')) throw err;
    const name = rel.split('/').pop();
    if (!name) throw err;
    try {
      return await vaultFindImage(name);
    } catch (findErr) {
      throw imageReadError(findErr);
    }
  }
}

/** Bytes of a vault image for publish. Resolves next to the note, then by file name. */
export async function readVaultImageBytes(
  href: string,
  notePath: string,
): Promise<{ bytes: Uint8Array; mime: string; fileName: string }> {
  const rel = await resolveVaultImageRel(href, notePath);
  const read = await readRelBytes(rel);
  const fileName = rel.split('/').pop() || rel;
  return { bytes: read.bytes, mime: read.mime, fileName };
}

async function blobForVaultImage(rel: string): Promise<string> {
  const cached = blobCache.get(rel);
  if (cached) return cached;
  const { bytes, mime } = await readRelBytes(rel);
  const url = URL.createObjectURL(
    new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], {
      type: mime,
    }),
  );
  blobCache.set(rel, url);
  return url;
}

export async function resolveVaultImageHref(
  href: string,
  notePath: string,
): Promise<string | null> {
  if (/^https:\/\//i.test(href)) return href;

  const assetId = parseNordlyAssetId(href);
  if (assetId) {
    const url = await resolveLegacyAssetUrl(assetId);
    if (!url) throw new AttachmentError('missing', href);
    return url;
  }

  const cfg = await vaultGetConfig();
  if (!cfg) throw new AttachmentError('missing', href);

  const rel = joinNoteRelative(notePath, href);
  if (!rel || rel.split('/').includes('..')) throw new AttachmentError('missing', href);

  try {
    return await blobForVaultImage(rel);
  } catch (err) {
    if (!(err instanceof AttachmentError) || err.code !== 'missing') throw err;
    if (href.includes('/') || href.includes('\\')) throw err;
    const name = rel.split('/').pop();
    if (!name) throw err;
    let found: string;
    try {
      found = await vaultFindImage(name);
    } catch (findErr) {
      throw imageReadError(findErr);
    }
    return blobForVaultImage(found);
  }
}

export async function createVaultPastedImageMarkdown(
  notePath: string,
  file: File,
): Promise<string> {
  const mime = (file.type || mimeFromFilename(file.name) || '').toLowerCase();
  if (!mime || !isAllowedImageMime(mime)) {
    throw new AttachmentError('bad_type', `unsupported image type: ${mime || file.name}`);
  }
  const MAX = 5 * 1024 * 1024;
  const buf = new Uint8Array(await file.arrayBuffer());
  if (buf.byteLength > MAX) {
    throw new AttachmentError('too_large');
  }
  const ext = (file.name.split('.').pop() || mime.split('/')[1] || 'png').toLowerCase();
  return withVaultNotePathMutation(notePath, async (resolvedNotePath) => {
    suppressVaultWatch();
    const relLink = await vaultWritePastedImage(resolvedNotePath, buf, ext);
    const absRel = joinNoteRelative(resolvedNotePath, relLink);
    await enqueueVaultFilePut(absRel, buf, 'bin', Date.now());
    const encoded = relLink
      .split('/')
      .map((s) => encodeURIComponent(s))
      .join('/');
    const alt = file.name.replace(/\.[^.]+$/, '') || 'image';
    return markdownImage(alt, encoded);
  });
}
