/** Relative vault markdown path. Rejects absolute paths, traversal, and non-markdown. */
export function isVaultRelPath(path: string): boolean {
  const p = path.trim();
  if (!p.toLowerCase().endsWith('.md')) return false;
  if (p.startsWith('/') || p.includes('\\') || p.includes('\0')) return false;
  const segments = p.split('/');
  return segments.every((seg) => seg !== '' && seg !== '.' && seg !== '..');
}

/** Rust `read_note` / Windows IO when the markdown file is gone. Other errors must surface. */
export function isMissingVaultNote(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : '';
  return /not found|no such file|os error 2|cannot find the file/i.test(msg);
}
