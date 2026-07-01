/** Strip Excalidraw runtime appState fields that break after JSON round-trip. */

import {
  type BoardCanvasTheme,
  nordlyExcalidrawCanvasBg,
  nordlyExcalidrawInitialAppState,
  nordlyExcalidrawStrokeColor,
} from './nordlyTheme';

const OMIT_KEYS = new Set([
  'collaborators',
  'selectedElementIds',
  'selectedGroupIds',
  'editingElement',
  'editingGroupId',
  'editingLinearElement',
  'resizingElement',
  'selectionElement',
  'cursorButton',
  'activeEmbeddable',
  'openMenu',
  'openPopup',
  'openSidebar',
  'openDialog',
  'snapLines',
  'originSnapOffset',
  'followedBy',
  'userToFollow',
  // UI theme is controlled via Excalidraw `theme` prop — never round-trip from disk.
  'theme',
  'showWelcomeScreen',
  'exportBackground',
  'exportWithDarkMode',
]);

export function sanitizeAppStateForPersistence(
  raw: Record<string, unknown> | undefined,
  boardTheme: BoardCanvasTheme = 'dark',
): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (OMIT_KEYS.has(key)) continue;
    out[key] = value;
  }
  out.viewBackgroundColor = nordlyExcalidrawCanvasBg(boardTheme);
  out.currentItemStrokeColor = nordlyExcalidrawStrokeColor(boardTheme);
  out.currentItemBackgroundColor = 'transparent';
  return out;
}

/** Merge scroll/zoom from disk; canvas color always from `base`. */
export function mergePersistedAppState(
  base: Record<string, unknown>,
  persisted: Record<string, unknown> | undefined,
  boardTheme: BoardCanvasTheme = 'dark',
): Record<string, unknown> {
  return {
    ...sanitizeAppStateForPersistence(persisted, boardTheme),
    ...base,
    ...nordlyExcalidrawInitialAppState(boardTheme),
  };
}
