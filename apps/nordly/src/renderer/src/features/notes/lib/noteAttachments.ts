/** Note image attachment limits + nordly-asset markdown helpers. */

import { NORDLY_ASSET_SCHEME, nordlyAssetHref, parseNordlyAssetId } from '@shared/lib/nordlyAsset';

export { NORDLY_ASSET_SCHEME, nordlyAssetHref, parseNordlyAssetId };

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_NOTE = 50;

export const ALLOWED_IMAGE_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

const EXT_TO_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

export type AttachmentErrorCode =
  | 'too_large'
  | 'bad_type'
  | 'too_many'
  | 'missing'
  | 'vault_locked'
  | 'publish_unresolved';

export class AttachmentError extends Error {
  readonly code: AttachmentErrorCode;

  constructor(code: AttachmentErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'AttachmentError';
    this.code = code;
  }
}

export function mimeFromFilename(name: string): string | null {
  const ext = name.replace(/^.*\./, '').toLowerCase();
  return EXT_TO_MIME[ext] ?? null;
}

export function isAllowedImageMime(mime: string): boolean {
  return ALLOWED_IMAGE_MIMES.has(mime.toLowerCase());
}

export function markdownImage(alt: string, href: string): string {
  const safeAlt = alt.replace(/[[\]]/g, '');
  return `![${safeAlt}](${href})`;
}

/** Match standard markdown images: ![alt](href) */
export const MD_IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)\)/g;

/** Obsidian embed: ![[path/or name.png]] or ![[path|alias]] */
export const OBSIDIAN_EMBED_RE = /!\[\[([^\]|#]+)(?:\|[^\]]+)?\]\]/g;

export function extractNordlyAssetIds(bodyMd: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  MD_IMAGE_RE.lastIndex = 0;
  let m = MD_IMAGE_RE.exec(bodyMd);
  while (m) {
    const id = parseNordlyAssetId(m[2] ?? '');
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
    m = MD_IMAGE_RE.exec(bodyMd);
  }
  return ids;
}

export function bytesToBase64(bytes: Uint8Array): string {
  // Chunk to avoid O(n²) string growth and call-stack limits on large images.
  const chunk = 0x2000;
  let bin = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    const end = Math.min(i + chunk, bytes.length);
    bin += String.fromCharCode(...bytes.subarray(i, end));
  }
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
