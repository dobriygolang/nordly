import { newElementWith } from '@excalidraw/excalidraw';
import {
  NORDLY_EXCALIDRAW_STROKE_DARK,
  NORDLY_EXCALIDRAW_STROKE_LIGHT,
  type BoardCanvasTheme,
} from '@shared/lib/excalidraw/nordlyTheme';

export const CANONICAL_BOARD_STROKE = '#ffffff';

type ColoredElement = {
  strokeColor?: string;
  backgroundColor?: string;
};

function patchElementColors<T extends ColoredElement>(
  el: T,
  strokeColor: string,
  backgroundColor: string,
): T {
  if (el.strokeColor === strokeColor && el.backgroundColor === backgroundColor) return el;
  return newElementWith(el as unknown as Parameters<typeof newElementWith>[0], {
    strokeColor,
    backgroundColor,
  }) as unknown as T;
}

export function canonicalizeElementsForStorage<T extends ColoredElement>(
  elements: readonly T[],
): T[] {
  return elements.map((el) =>
    patchElementColors(el, CANONICAL_BOARD_STROKE, 'transparent'),
  );
}

export function applyLocalBoardTheme<T extends ColoredElement>(
  elements: readonly T[],
  boardTheme: BoardCanvasTheme,
): T[] {
  const strokeColor =
    boardTheme === 'light' ? NORDLY_EXCALIDRAW_STROKE_LIGHT : NORDLY_EXCALIDRAW_STROKE_DARK;
  return elements.map((el) => patchElementColors(el, strokeColor, 'transparent'));
}

export function boardThemeSceneFromCanonical<T extends ColoredElement>(
  canonicalElements: readonly T[],
  boardTheme: BoardCanvasTheme,
): T[] {
  return applyLocalBoardTheme(canonicalizeElementsForStorage(canonicalElements), boardTheme);
}
