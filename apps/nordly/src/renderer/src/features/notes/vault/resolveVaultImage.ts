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
export async function resolveVaultImageHref(
  href: string,
  notePath: string,
): Promise<string | null> {
  if (/^https:\/\//i.test(href)) return href;

  const assetId = parseNordlyAssetId(href);
  if (assetId) {
    return resolveLegacyAssetUrl(assetId);
  }

  const cfg = await vaultGetConfig();
  if (!cfg) return null;

  const rel = joinNoteRelative(notePath, href);
  if (!rel || rel.split('/').includes('..')) return null;

  const mime = mimeFromFilename(rel);
  if (!mime || !isAllowedImageMime(mime)) return null;

  const cached = blobCache.get(rel);
  if (cached) return cached;

  const bytes = await vaultReadBytes(rel);
  const url = URL.createObjectURL(
    new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], {
      type: mime,
    }),
  );
  blobCache.set(rel, url);
  return url;
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
