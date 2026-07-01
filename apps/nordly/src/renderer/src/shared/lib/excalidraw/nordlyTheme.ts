import type { ThemeId } from '@widgets/CanvasBg';

/** Excalidraw chrome — follows Nordly theme, bottom toolbar only.
 *
 * Canvas fill is `appState.viewBackgroundColor` (not the `theme` prop).
 * Dark board uses true #000 (no Excalidraw invert filter).
 * @see https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props/initialdata
 */

export type ExcalidrawThemeMode = 'light' | 'dark';
export type BoardCanvasTheme = 'light' | 'dark';

export const NORDLY_EXCALIDRAW_CANVAS_LIGHT = '#fafaf8';
export const NORDLY_EXCALIDRAW_CANVAS_DARK = '#000000';

export const NORDLY_EXCALIDRAW_STROKE_LIGHT = '#1e1e1e';
export const NORDLY_EXCALIDRAW_STROKE_DARK = '#ffffff';

/** @deprecated use nordlyExcalidrawCanvasBg */
export const NORDLY_EXCALIDRAW_CANVAS_BG = NORDLY_EXCALIDRAW_CANVAS_LIGHT;

export const NORDLY_EXCALIDRAW_MOUNT_CLASS = 'nordly-excalidraw-mount';

export const NORDLY_EXCALIDRAW_UI_OPTIONS = {
  canvasActions: {
    changeViewBackgroundColor: false,
    clearCanvas: false,
    export: false,
    loadScene: false,
    saveToActiveFile: false,
    toggleTheme: false,
    saveAsImage: false,
  },
  tools: {
    image: true,
  },
} as const;

/** Map Nordly canvas theme → Excalidraw UI theme. Light-palette themes use light mode. */
const LIGHT_EXCALIDRAW_THEMES: ReadonlyArray<ThemeId> = ['drift', 'visor'];

export function nordlyExcalidrawThemeFor(nordlyTheme: ThemeId): ExcalidrawThemeMode {
  return LIGHT_EXCALIDRAW_THEMES.includes(nordlyTheme) ? 'light' : 'dark';
}

export function nordlyExcalidrawStrokeColor(boardTheme: BoardCanvasTheme): string {
  return boardTheme === 'light' ? NORDLY_EXCALIDRAW_STROKE_LIGHT : NORDLY_EXCALIDRAW_STROKE_DARK;
}

export function nordlyExcalidrawCanvasBg(boardTheme: BoardCanvasTheme): string {
  return boardTheme === 'light' ? NORDLY_EXCALIDRAW_CANVAS_LIGHT : NORDLY_EXCALIDRAW_CANVAS_DARK;
}

/** initialData.appState — do not set `theme` here; use the `theme` prop instead. */
export function nordlyExcalidrawInitialAppState(boardTheme: BoardCanvasTheme = 'dark') {
  return {
    viewBackgroundColor: nordlyExcalidrawCanvasBg(boardTheme),
    showWelcomeScreen: false,
    currentItemStrokeColor: nordlyExcalidrawStrokeColor(boardTheme),
    currentItemBackgroundColor: 'transparent',
  };
}

/** Minimal patch for excalidrawAPI.updateScene after mount. */
export function nordlyExcalidrawCanvasPatch(boardTheme: BoardCanvasTheme = 'dark') {
  return {
    viewBackgroundColor: nordlyExcalidrawCanvasBg(boardTheme),
    currentItemStrokeColor: nordlyExcalidrawStrokeColor(boardTheme),
    currentItemBackgroundColor: 'transparent',
  };
}
