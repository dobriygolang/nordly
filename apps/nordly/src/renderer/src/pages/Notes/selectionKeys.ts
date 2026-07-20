/** Selection keys for notes sidebar multi-select (notes + folders). */

export type SelectMods = { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean };

export function noteSelKey(id: string): string {
  return `note:${id}`;
}

export function folderSelKey(id: string): string {
  return `folder:${id}`;
}

export function parseSelKey(key: string): { type: 'note' | 'folder'; id: string } | null {
  if (key.startsWith('note:')) return { type: 'note', id: key.slice(5) };
  if (key.startsWith('folder:')) return { type: 'folder', id: key.slice(7) };
  return null;
}

export function isNotesListHotkeyBlocked(e: KeyboardEvent): boolean {
  // Prefer event target — WKWebView can leave CodeMirror as activeElement after
  // sidebar clicks, which would wrongly suppress ⌫ / ⌘A.
  const target = e.target;
  if (target instanceof Element && target.closest('.nordly-vault-sidebar')) {
    // Folder rename input lives in the sidebar — still typing.
    if (target instanceof HTMLElement) {
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return true;
    }
    return false;
  }
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  if (target.closest('.cm-editor, [contenteditable="true"], .nordly-vault-main')) return true;
  return false;
}
