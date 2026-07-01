import { newElementWith } from '@excalidraw/excalidraw'
import { EXCALIDRAW_STROKE, type BoardCanvasTheme } from '@/lib/collab/excalidrawTheme'

/** Single ink color in Yjs / disk — local theme applies stroke on each client. */
export const CANONICAL_BOARD_STROKE = '#ffffff'

type ColoredElement = {
  strokeColor?: string
  backgroundColor?: string
}

function patchElementColors<T extends ColoredElement>(
  el: T,
  strokeColor: string,
  backgroundColor: string,
): T {
  if (el.strokeColor === strokeColor && el.backgroundColor === backgroundColor) return el
  return newElementWith(el as unknown as Parameters<typeof newElementWith>[0], {
    strokeColor,
    backgroundColor,
  }) as unknown as T
}

/** Persist geometry only — no per-user theme colors in shared state. */
export function canonicalizeElementsForStorage<T extends ColoredElement>(elements: readonly T[]): T[] {
  return elements.map((el) =>
    patchElementColors(el, CANONICAL_BOARD_STROKE, 'transparent'),
  )
}

/** Viewer-local B&W stroke; never written to Yjs. */
export function applyLocalBoardTheme<T extends ColoredElement>(
  elements: readonly T[],
  boardTheme: BoardCanvasTheme,
): T[] {
  const strokeColor = EXCALIDRAW_STROKE[boardTheme]
  return elements.map((el) => patchElementColors(el, strokeColor, 'transparent'))
}

export function boardThemeSceneFromCanonical<T extends ColoredElement>(
  canonicalElements: readonly T[],
  boardTheme: BoardCanvasTheme,
): T[] {
  return applyLocalBoardTheme(canonicalizeElementsForStorage(canonicalElements), boardTheme)
}

/** Remap live canvas elements when the viewer toggles board theme (read from getSceneElements). */
export function remapDisplayElementsForBoardTheme<T extends ColoredElement>(
  displayElements: readonly T[],
  boardTheme: BoardCanvasTheme,
): T[] {
  return applyLocalBoardTheme(canonicalizeElementsForStorage(displayElements), boardTheme)
}
