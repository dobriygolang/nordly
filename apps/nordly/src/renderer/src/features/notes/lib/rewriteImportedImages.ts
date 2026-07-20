/** Rewrite Obsidian / relative image refs in imported markdown to nordly-asset: links. */

import {
  AttachmentError,
  MD_IMAGE_RE,
  OBSIDIAN_EMBED_RE,
  markdownImage,
  mimeFromFilename,
  nordlyAssetHref,
} from '@features/notes/lib/noteAttachments';
import { parseNordlyAssetId } from '@shared/lib/nordlyAsset';

export type ImageBytesLoader = (
  relativePath: string,
) => Promise<{ bytes: Uint8Array; fileName: string; mime: string } | null>;

/** Injected so lib/ does not import api/. */
export type CreateAttachmentFn = (
  noteId: string,
  fileName: string,
  mime: string,
  bytes: Uint8Array,
) => Promise<{ attachment: { id: string } }>;

type Replacement = { start: number; end: number; text: string };

function normalizeRelPath(raw: string): string {
  return raw
    .trim()
    .replace(/^\.\//, '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
}

function applyReplacements(body: string, replacements: Replacement[]): string {
  if (replacements.length === 0) return body;
  const sorted = [...replacements].sort((a, b) => a.start - b.start);
  let out = '';
  let cursor = 0;
  for (const r of sorted) {
    if (r.start < cursor) continue; // overlapping — keep earlier
    out += body.slice(cursor, r.start);
    out += r.text;
    cursor = r.end;
  }
  out += body.slice(cursor);
  return out;
}

/**
 * Replace ![[file]] and ![](relative) with nordly-asset after ingesting bytes via loader.
 * Leaves missing images as original syntax (unresolved). Returns warning paths.
 * HTTPS images are left unchanged; plain HTTP is left unresolved with a warning.
 */
export async function rewriteImportedImages(
  noteId: string,
  bodyMd: string,
  loadImage: ImageBytesLoader,
  createAttachment: CreateAttachmentFn,
): Promise<{ bodyMd: string; missing: string[]; warnings: string[] }> {
  const missing: string[] = [];
  const warnings: string[] = [];
  const cache = new Map<string, string>(); // rel path → asset id
  const replacements: Replacement[] = [];

  const ingest = async (relRaw: string): Promise<string | null> => {
    const rel = normalizeRelPath(relRaw);
    if (!rel) return null;
    const cached = cache.get(rel);
    if (cached) return cached;
    try {
      const loaded = await loadImage(rel);
      if (!loaded) {
        missing.push(rel);
        return null;
      }
      const mime = loaded.mime || mimeFromFilename(loaded.fileName) || '';
      const { attachment } = await createAttachment(
        noteId,
        loaded.fileName,
        mime,
        loaded.bytes,
      );
      cache.set(rel, attachment.id);
      return attachment.id;
    } catch (err) {
      if (err instanceof AttachmentError) {
        warnings.push(`${rel}: ${err.code}`);
        return null;
      }
      throw err;
    }
  };

  // Collect Obsidian embeds (positions from original body).
  OBSIDIAN_EMBED_RE.lastIndex = 0;
  let em = OBSIDIAN_EMBED_RE.exec(bodyMd);
  while (em) {
    const full = em[0];
    const path = (em[1] ?? '').trim();
    const start = em.index;
    const end = start + full.length;
    const id = await ingest(path);
    if (id) {
      const alt = path.replace(/^.*\//, '').replace(/\.[^.]+$/, '') || 'image';
      replacements.push({ start, end, text: markdownImage(alt, nordlyAssetHref(id)) });
    }
    em = OBSIDIAN_EMBED_RE.exec(bodyMd);
  }

  // Standard markdown images — skip https; warn on http; ingest relative.
  MD_IMAGE_RE.lastIndex = 0;
  let im = MD_IMAGE_RE.exec(bodyMd);
  while (im) {
    const full = im[0];
    const alt = im[1] ?? '';
    const href = (im[2] ?? '').trim();
    const start = im.index;
    const end = start + full.length;
    im = MD_IMAGE_RE.exec(bodyMd);

    if (/^https:\/\//i.test(href) || parseNordlyAssetId(href)) continue;
    if (/^http:\/\//i.test(href)) {
      warnings.push(`${href}: http_not_allowed`);
      continue;
    }
    const id = await ingest(href);
    if (!id) continue;
    replacements.push({
      start,
      end,
      text: markdownImage(alt || 'image', nordlyAssetHref(id)),
    });
  }

  return {
    bodyMd: applyReplacements(bodyMd, replacements),
    missing,
    warnings,
  };
}
