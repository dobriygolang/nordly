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

export function extractNordlyAssetIds(bodyMd: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const m of bodyMd.matchAll(/!\[([^\]]*)\]\(([^)\s]+)\)/g)) {
    const id = parseNordlyAssetId(m[2] ?? '');
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}
