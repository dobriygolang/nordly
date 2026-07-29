/** One-shot IndexedDB → filesystem vault export. */

import { notesStoreGet, notesStoreList } from '@features/notes/repository/notesStore';
import { foldersStoreList } from '@features/notes/repository/foldersStore';
import {
  attachmentsStoreGetPlainBytes,
  attachmentsStoreListByNote,
} from '@features/notes/repository/attachmentsStore';
import {
  extractNordlyAssetIds,
  mimeFromFilename,
} from '@features/notes/lib/noteAttachments';
import { parseNordlyAssetId } from '@shared/lib/nordlyAsset';

import { vaultClearConfig, vaultSetConfig, vaultWriteBytes, vaultWriteNote } from './ipc';
import type { NotesVaultConfig } from './types';

function sanitizeStem(title: string): string {
  const t = title.trim() || 'Untitled';
  return t
    .replace(/[/\\:*?"<>|]/g, '-')
    .replace(/[\u0000-\u001f]/g, '-')
    .replace(/^\.+|\.+$/g, '')
    .trim() || 'Untitled';
}

function folderPathForId(
  folderId: string | null | undefined,
  byId: Map<string, { id: string; name: string; parentId: string | null }>,
): string | null {
  if (!folderId) return null;
  const parts: string[] = [];
  let cur: string | null = folderId;
  const guard = new Set<string>();
  while (cur) {
    if (guard.has(cur)) break;
    guard.add(cur);
    const f = byId.get(cur);
    if (!f) break;
    parts.unshift(sanitizeStem(f.name));
    cur = f.parentId;
  }
  return parts.length ? parts.join('/') : null;
}

function extFromMime(mime: string, fileName: string): string {
  const fromName = fileName.includes('.') ? fileName.replace(/^.*\./, '').toLowerCase() : '';
  if (fromName && /^[a-z0-9]+$/.test(fromName)) return fromName;
  switch (mime.toLowerCase()) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/gif':
      return 'gif';
    case 'image/webp':
      return 'webp';
    default:
      return 'png';
  }
}

function uniqueRel(used: Set<string>, dir: string, stem: string, ext: string): string {
  const base = dir ? `${dir}/${stem}.${ext}` : `${stem}.${ext}`;
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  for (let i = 1; i < 10_000; i++) {
    const cand = dir ? `${dir}/${stem} (${i}).${ext}` : `${stem} (${i}).${ext}`;
    if (!used.has(cand)) {
      used.add(cand);
      return cand;
    }
  }
  const cand = dir
    ? `${dir}/${stem}-${Date.now()}.${ext}`
    : `${stem}-${Date.now()}.${ext}`;
  used.add(cand);
  return cand;
}

function rewriteAssetLinks(
  bodyMd: string,
  idToRel: Map<string, string>,
): string {
  return bodyMd.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (full, alt, href) => {
    const id = parseNordlyAssetId(String(href));
    if (!id) return full;
    const rel = idToRel.get(id);
    if (!rel) return full;
    const encoded = rel
      .split('/')
      .map((seg) => encodeURIComponent(seg))
      .join('/');
    return `![${alt}](${encoded})`;
  });
}

export interface ExportResult {
  notesExported: number;
  attachmentsExported: number;
  skippedLocked: number;
  config: NotesVaultConfig;
}

/**
 * Bind vault root, write IDB notes + attachments to disk, mark migrated.
 * Skips vault-locked notes (empty body) — caller should unlock first when possible.
 * On failure after bind: clears vault config so onboarding is not skipped next launch.
 */
export async function exportIdbNotesToVault(
  root: string,
  attachmentFolder = 'img',
): Promise<ExportResult> {
  const config = await vaultSetConfig({
    root,
    attachmentFolder,
    migratedFromIdb: false,
  });

  try {
    const folders = await foldersStoreList();
    const byId = new Map(folders.map((f) => [f.id, f]));
    const usedNotePaths = new Set<string>();
    const usedAttPaths = new Set<string>();

    const summaries = await notesStoreList();
    let notesExported = 0;
    let attachmentsExported = 0;
    let skippedLocked = 0;

    for (const summary of summaries) {
      if (summary.vaultLocked) {
        skippedLocked += 1;
        continue;
      }
      const note = await notesStoreGet(summary.id);
      if (!note || note.vaultLocked) {
        skippedLocked += 1;
        continue;
      }

      const folderRel = folderPathForId(note.folderId, byId);
      const stem = sanitizeStem(note.title);
      const noteRel = uniqueRel(usedNotePaths, folderRel ?? '', stem, 'md');

      const idToRel = new Map<string, string>();
      const assetIds = extractNordlyAssetIds(note.bodyMd);
      const listed = await attachmentsStoreListByNote(note.id);
      const ids = new Set([...assetIds, ...listed.map((a) => a.id)]);

      for (const id of ids) {
        let plain: Awaited<ReturnType<typeof attachmentsStoreGetPlainBytes>>;
        try {
          plain = await attachmentsStoreGetPlainBytes(id);
        } catch {
          continue;
        }
        if (!plain) continue;
        const ext = extFromMime(plain.mime, plain.fileName);
        const attStem = sanitizeStem(
          plain.fileName.replace(/\.[^.]+$/, '') || `image-${id.slice(0, 8)}`,
        );
        const attRel = uniqueRel(usedAttPaths, config.attachmentFolder, attStem, ext);
        await vaultWriteBytes(attRel, plain.bytes);
        const noteDir = noteRel.includes('/') ? noteRel.slice(0, noteRel.lastIndexOf('/')) : '';
        const relLink = relativePath(noteDir, attRel);
        idToRel.set(id, relLink);
        attachmentsExported += 1;
      }

      const body = rewriteAssetLinks(note.bodyMd, idToRel);
      await vaultWriteNote(noteRel, body);
      notesExported += 1;
    }

    const finalCfg = await vaultSetConfig({
      ...config,
      migratedFromIdb: true,
    });

    return { notesExported, attachmentsExported, skippedLocked, config: finalCfg };
  } catch (err) {
    await vaultClearConfig().catch(() => undefined);
    throw err;
  }
}

function relativePath(fromDir: string, toFile: string): string {
  const fromParts = fromDir ? fromDir.split('/').filter(Boolean) : [];
  const toParts = toFile.split('/').filter(Boolean);
  let i = 0;
  while (i < fromParts.length && i < toParts.length && fromParts[i] === toParts[i]) {
    i += 1;
  }
  const ups = fromParts.slice(i).map(() => '..');
  const down = toParts.slice(i);
  const parts = [...ups, ...down];
  return parts.length ? parts.join('/') : toParts[toParts.length - 1] ?? toFile;
}

export function mimeOrFilenameHint(fileName: string, mime: string): string {
  return mime || mimeFromFilename(fileName) || 'application/octet-stream';
}
