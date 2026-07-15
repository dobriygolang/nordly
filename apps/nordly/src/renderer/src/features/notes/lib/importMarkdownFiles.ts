/** Parse OS File / path drops into note title + bodyMd. */

const MARKDOWN_EXT = /\.(md|markdown)$/i;

export type MarkdownDraft = { title: string; bodyMd: string };

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

export async function readMarkdownFile(file: File): Promise<MarkdownDraft> {
  if (!isMarkdownFilename(file.name)) {
    throw new Error(`Not a markdown file: ${file.name}`);
  }
  const bodyMd = await file.text();
  return { title: titleFromMarkdownFilename(file.name), bodyMd };
}

export async function readMarkdownPath(
  path: string,
  readText: (path: string) => Promise<string>,
): Promise<MarkdownDraft> {
  const name = basenameFromPath(path);
  if (!isMarkdownFilename(name)) {
    throw new Error(`Not a markdown file: ${name}`);
  }
  const bodyMd = await readText(path);
  return { title: titleFromMarkdownFilename(name), bodyMd };
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
