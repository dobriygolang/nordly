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

export interface SavedEditorScroll {
  top: number;
  left: number;
}

export function loadEditorScroll(key: string): SavedEditorScroll | undefined {
  try {
    const raw = localStorage.getItem(`${key}:scroll`);
    if (raw === null) return undefined;
    const scroll = JSON.parse(raw) as SavedEditorScroll;
    if (!scroll || !Number.isFinite(scroll.top) || !Number.isFinite(scroll.left)
      || scroll.top < 0 || scroll.left < 0) throw new Error('Invalid saved editor scroll');
    return scroll;
  } catch (error) {
    console.warn('[nordly:editor] scroll load failed', error);
    return undefined;
  }
}

export function saveEditorScroll(key: string, scroll: SavedEditorScroll): void {
  try {
    localStorage.setItem(`${key}:scroll`, JSON.stringify(scroll));
  } catch (error) {
    console.warn('[nordly:editor] scroll save failed', error);
  }
}
