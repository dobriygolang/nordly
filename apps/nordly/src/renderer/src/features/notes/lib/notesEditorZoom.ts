/** Notes editor zoom (Obsidian-like ⌘+/⌘−) — device-local, Notes page only. */

export const NOTES_EDITOR_ZOOM_KEY = 'nordly:notes:editor-zoom';

export const NOTES_ZOOM_DEFAULT = 1;
export const NOTES_ZOOM_MIN = 0.7;
export const NOTES_ZOOM_MAX = 1.6;
export const NOTES_ZOOM_STEP = 0.1;

export function clampNotesEditorZoom(value: number): number {
  if (!Number.isFinite(value)) return NOTES_ZOOM_DEFAULT;
  const stepped = Math.round(value / NOTES_ZOOM_STEP) * NOTES_ZOOM_STEP;
  return Math.min(NOTES_ZOOM_MAX, Math.max(NOTES_ZOOM_MIN, Number(stepped.toFixed(1))));
}

export function loadNotesEditorZoom(): number {
  if (typeof window === 'undefined') return NOTES_ZOOM_DEFAULT;
  try {
    const raw = window.localStorage.getItem(NOTES_EDITOR_ZOOM_KEY);
    if (raw == null) return NOTES_ZOOM_DEFAULT;
    return clampNotesEditorZoom(Number.parseFloat(raw));
  } catch (err) {
    console.warn('[notesEditorZoom] load failed', err);
    return NOTES_ZOOM_DEFAULT;
  }
}

export function saveNotesEditorZoom(value: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(NOTES_EDITOR_ZOOM_KEY, String(clampNotesEditorZoom(value)));
  } catch (err) {
    console.warn('[notesEditorZoom] save failed', err);
  }
}

export function stepNotesEditorZoom(current: number, direction: 1 | -1): number {
  return clampNotesEditorZoom(current + direction * NOTES_ZOOM_STEP);
}
