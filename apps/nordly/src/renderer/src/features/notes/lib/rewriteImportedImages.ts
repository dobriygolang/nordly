/** Rewrite Obsidian / relative image refs in imported markdown to attachment links. */

import {
  AttachmentError,
  markdownImage,
  mimeFromFilename,
} from '@features/notes/lib/noteAttachments';
import { parseNordlyAssetId } from '@shared/lib/nordlyAsset';

export type ImageBytesLoader = (
  relativePath: string,
) => Promise<{ bytes: Uint8Array; fileName: string; mime: string } | null>;

/** Injected so lib/ does not import api/. Returns markdown ready to insert (IDB or vault). */
export type CreateAttachmentFn = (
  noteId: string,
  fileName: string,
  mime: string,
  bytes: Uint8Array,
) => Promise<{ attachment: { id: string }; markdown: string }>;

type Replacement = { start: number; end: number; text: string };

function normalizeRelPath(raw: string): string {
  return raw
    .trim()
    .replace(/^\.\//, '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
}

function hrefFromMarkdownImage(md: string): string | null {
  const m = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(md.trim());
  return m?.[2] ?? null;
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
 * Replace ![[file]] and ![](relative) after ingesting bytes via loader.
 * Uses markdown from createAttachment (nordly-asset: or vault-relative ![](…)).
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
  const cache = new Map<string, string>(); // rel path → markdown href
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
      const { markdown } = await createAttachment(
        noteId,
        loaded.fileName,
        mime,
        loaded.bytes,
      );
      const href = hrefFromMarkdownImage(markdown);
      if (!href) {
        warnings.push(`${rel}: bad_attachment_markdown`);
        return null;
      }
      cache.set(rel, href);
      return href;
    } catch (err) {
      if (err instanceof AttachmentError) {
        warnings.push(`${rel}: ${err.code}`);
        return null;
      }
      throw err;
    }
  };

  // Collect Obsidian embeds (positions from original body).
  for (const em of bodyMd.matchAll(/!\[\[([^\]|#]+)(?:\|[^\]]+)?\]\]/g)) {
    const full = em[0];
    const path = (em[1] ?? '').trim();
    const start = em.index;
    const end = start + full.length;
    const href = await ingest(path);
    if (href) {
      const alt = path.replace(/^.*\//, '').replace(/\.[^.]+$/, '') || 'image';
      replacements.push({ start, end, text: markdownImage(alt, href) });
    }
  }

  // Standard markdown images — skip https; warn on http; ingest relative.
  for (const im of bodyMd.matchAll(/!\[([^\]]*)\]\(([^)\s]+)\)/g)) {
    const full = im[0];
    const alt = im[1] ?? '';
    const href = (im[2] ?? '').trim();
    const start = im.index;
    const end = start + full.length;

    if (/^https:\/\//i.test(href) || parseNordlyAssetId(href)) continue;
    if (/^http:\/\//i.test(href)) {
      warnings.push(`${href}: http_not_allowed`);
      continue;
    }
    const nextHref = await ingest(href);
    if (!nextHref) continue;
    replacements.push({
      start,
      end,
      text: markdownImage(alt || 'image', nextHref),
    });
  }

  return {
    bodyMd: applyReplacements(bodyMd, replacements),
    missing,
    warnings,
  };
}
