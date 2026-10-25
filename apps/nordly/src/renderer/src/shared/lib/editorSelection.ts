export interface SavedEditorSelection {
  anchor: number;
  head: number;
}

export function loadEditorSelection(key: string, length: number): SavedEditorSelection | undefined {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return undefined;
    const selection = JSON.parse(raw) as SavedEditorSelection;
    if (!selection || !Number.isSafeInteger(selection.anchor) || !Number.isSafeInteger(selection.head)
      || selection.anchor < 0 || selection.head < 0) {
      throw new Error('Invalid saved editor selection');
    }
    return { anchor: Math.min(selection.anchor, length), head: Math.min(selection.head, length) };
  } catch (error) {
    console.warn('[nordly:editor] selection load failed', error);
    return undefined;
  }
}

export function saveEditorSelection(key: string, selection: SavedEditorSelection): void {
  try {
    window.localStorage.setItem(key, JSON.stringify({ anchor: selection.anchor, head: selection.head }));
  } catch (error) {
    console.warn('[nordly:editor] selection save failed', error);
  }
}
