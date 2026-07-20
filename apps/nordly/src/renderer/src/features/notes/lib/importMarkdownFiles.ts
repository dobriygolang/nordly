/** Parse OS File / path drops into note title + bodyMd (+ folder path segments). */

const MARKDOWN_EXT = /\.(md|markdown)$/i;

export const MAX_MARKDOWN_IMPORT_FILES = 500;
export const MAX_MARKDOWN_IMPORT_DEPTH = 20;

export type MarkdownDraft = {
  title: string;
  bodyMd: string;
  /**
   * Folder path under the current focus parent.
   * Loose file → []; dropped dir `Vault/a/b/n.md` → `['Vault','a','b']`.
   */
  folderSegments: string[];
  /** Absolute directory containing the markdown file (Tauri / path imports). */
  sourceDir?: string;
};

export type MarkdownImportErrorCode =
  | 'only_md'
  | 'empty_folder'
  | 'too_many'
  | 'too_deep';

export class MarkdownImportError extends Error {
  readonly code: MarkdownImportErrorCode;

  constructor(code: MarkdownImportErrorCode) {
    super(code);
    this.name = 'MarkdownImportError';
    this.code = code;
  }
}

export function isMarkdownFilename(name: string): boolean {
  return MARKDOWN_EXT.test(name);
}

export function basenameFromPath(path: string): string {
  return path.replace(/^.*[/\\]/, '');
}

export function titleFromMarkdownFilename(name: string): string {
  const base = basenameFromPath(name);
  const withoutExt = base.replace(MARKDOWN_EXT, '').trim();
  return withoutExt || 'Untitled';
}

/** Skip hidden names and node_modules. */
export function shouldSkipDirName(name: string): boolean {
  if (!name || name === '.' || name === '..') return true;
  if (name.startsWith('.')) return true;
  if (name === 'node_modules') return true;
  return false;
}

export function splitRelativeDir(relativeDir: string): string[] {
  if (!relativeDir) return [];
  return relativeDir
    .replace(/\\/g, '/')
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function assertImportLimits(fileCount: number, maxDepth: number): void {
  if (fileCount > MAX_MARKDOWN_IMPORT_FILES) {
    throw new MarkdownImportError('too_many');
  }
  if (maxDepth > MAX_MARKDOWN_IMPORT_DEPTH) {
    throw new MarkdownImportError('too_deep');
  }
}

export async function readMarkdownFile(
  file: File,
  folderSegments: string[] = [],
): Promise<MarkdownDraft> {
  if (!isMarkdownFilename(file.name)) {
    throw new Error(`Not a markdown file: ${file.name}`);
  }
  const bodyMd = await file.text();
  return {
    title: titleFromMarkdownFilename(file.name),
    bodyMd,
    folderSegments,
  };
}

export async function readMarkdownPath(
  path: string,
  readText: (path: string) => Promise<string>,
  folderSegments: string[] = [],
): Promise<MarkdownDraft> {
  const name = basenameFromPath(path);
  if (!isMarkdownFilename(name)) {
    throw new Error(`Not a markdown file: ${name}`);
  }
  const bodyMd = await readText(path);
  const sourceDir = path.replace(/[/\\][^/\\]+$/, '') || undefined;
  return {
    title: titleFromMarkdownFilename(name),
    bodyMd,
    folderSegments,
    sourceDir,
  };
}

/** True when the drag payload is OS files (not note-row @dnd-kit). */
export function isFileDrag(dt: DataTransfer | null | undefined): boolean {
  if (!dt) return false;
  return Array.from(dt.types).includes('Files');
}

export function listDroppedMarkdownFiles(files: FileList | File[] | null | undefined): File[] {
  if (!files) return [];
  return Array.from(files).filter((f) => isMarkdownFilename(f.name));
}

export function listDroppedMarkdownPaths(paths: string[] | null | undefined): string[] {
  if (!paths) return [];
  return paths.filter((p) => isMarkdownFilename(basenameFromPath(p)));
}

/** Build folder segments for a Tauri path entry under a dropped directory root. */
export function folderSegmentsForDirEntry(
  rootName: string,
  relativeDir: string,
): string[] {
  return [rootName, ...splitRelativeDir(relativeDir)].filter(Boolean);
}

type FileSystemEntryLike = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (success: (file: File) => void, error?: (err: DOMException) => void) => void;
  createReader?: () => {
    readEntries: (
      success: (entries: FileSystemEntryLike[]) => void,
      error?: (err: DOMException) => void,
    ) => void;
  };
};

function readEntryFile(entry: FileSystemEntryLike): Promise<File> {
  return new Promise((resolve, reject) => {
    if (!entry.file) {
      reject(new Error('File entry has no file()'));
      return;
    }
    entry.file(resolve, reject);
  });
}

function readAllDirectoryEntries(
  reader: {
    readEntries: (
      success: (entries: FileSystemEntryLike[]) => void,
      error?: (err: DOMException) => void,
    ) => void;
  },
): Promise<FileSystemEntryLike[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntryLike[] = [];
    const readBatch = () => {
      reader.readEntries(
        (batch) => {
          if (batch.length === 0) {
            resolve(all);
            return;
          }
          all.push(...batch);
          readBatch();
        },
        (err) => reject(err),
      );
    };
    readBatch();
  });
}

/** Recursively collect markdown under a directory; `baseSegments` is the folder path for files here. */
async function walkBrowserDirectory(
  dirEntry: FileSystemEntryLike,
  baseSegments: string[],
  out: MarkdownDraft[],
): Promise<void> {
  if (baseSegments.length > MAX_MARKDOWN_IMPORT_DEPTH) {
    throw new MarkdownImportError('too_deep');
  }
  if (!dirEntry.createReader) return;

  const children = await readAllDirectoryEntries(dirEntry.createReader());
  for (const child of children) {
    if (shouldSkipDirName(child.name)) continue;
    if (child.isFile) {
      if (!isMarkdownFilename(child.name)) continue;
      out.push(await readMarkdownFile(await readEntryFile(child), baseSegments));
    } else if (child.isDirectory) {
      await walkBrowserDirectory(child, [...baseSegments, child.name], out);
    }
  }
}

/**
 * Resolve HTML5 DataTransfer into markdown drafts (files + recursive folders).
 * Uses webkitGetAsEntry when available; falls back to flat FileList for loose files.
 */
export async function collectBrowserMarkdownDrafts(
  dt: DataTransfer,
): Promise<MarkdownDraft[]> {
  const items = dt.items ? Array.from(dt.items) : [];
  const drafts: MarkdownDraft[] = [];

  const entries: FileSystemEntryLike[] = [];
  for (const item of items) {
    if (item.kind !== 'file') continue;
    const getEntry = (
      item as DataTransferItem & {
        webkitGetAsEntry?: () => FileSystemEntryLike | null;
      }
    ).webkitGetAsEntry?.();
    if (getEntry) entries.push(getEntry);
  }

  let sawDirectory = false;

  if (entries.length > 0) {
    for (const entry of entries) {
      if (entry.isDirectory) {
        if (shouldSkipDirName(entry.name)) continue;
        sawDirectory = true;
        await walkBrowserDirectory(entry, [entry.name], drafts);
      } else if (entry.isFile && isMarkdownFilename(entry.name)) {
        drafts.push(await readMarkdownFile(await readEntryFile(entry), []));
      }
    }
  } else {
    for (const file of listDroppedMarkdownFiles(dt.files)) {
      drafts.push(await readMarkdownFile(file, []));
    }
  }

  if (drafts.length === 0) {
    throw new MarkdownImportError(sawDirectory ? 'empty_folder' : 'only_md');
  }

  const maxDepth = Math.max(0, ...drafts.map((d) => d.folderSegments.length));
  assertImportLimits(drafts.length, maxDepth);
  return drafts;
}
