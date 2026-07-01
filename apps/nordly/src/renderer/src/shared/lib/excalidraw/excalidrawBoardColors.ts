import { newElementWith } from '@excalidraw/excalidraw';
import type { BoardCanvasTheme } from '@shared/lib/excalidraw/nordlyTheme';

/** Excalidraw palette pairs (shade index reversal) + black/white swap for board theme toggle. */
const BOARD_COLOR_INVERT: Record<string, string> = {
  transparent: 'transparent',
  '#1e1e1e': '#ffffff',
  '#ffffff': '#1e1e1e',
  '#000000': '#ffffff',
  '#f8f1ee': '#846358',
  '#eaddd7': '#a18072',
  '#d2bab0': '#d2bab0',
  '#a18072': '#eaddd7',
  '#846358': '#f8f1ee',
  '#f8f9fa': '#343a40',
  '#e9ecef': '#868e96',
  '#ced4da': '#ced4da',
  '#868e96': '#e9ecef',
  '#343a40': '#f8f9fa',
  '#fff5f5': '#e03131',
  '#ffc9c9': '#fa5252',
  '#ff8787': '#ff8787',
  '#fa5252': '#ffc9c9',
  '#e03131': '#fff5f5',
  '#fff0f6': '#c2255c',
  '#fcc2d7': '#e64980',
  '#f783ac': '#f783ac',
  '#e64980': '#fcc2d7',
  '#c2255c': '#fff0f6',
  '#f8f0fc': '#9c36b5',
  '#eebefa': '#be4bdb',
  '#da77f2': '#da77f2',
  '#be4bdb': '#eebefa',
  '#9c36b5': '#f8f0fc',
  '#f3f0ff': '#6741d9',
  '#d0bfff': '#7950f2',
  '#9775fa': '#9775fa',
  '#7950f2': '#d0bfff',
  '#6741d9': '#f3f0ff',
  '#e7f5ff': '#1971c2',
  '#a5d8ff': '#228be6',
  '#4dabf7': '#4dabf7',
  '#228be6': '#a5d8ff',
  '#1971c2': '#e7f5ff',
  '#e3fafc': '#0c8599',
  '#99e9f2': '#15aabf',
  '#3bc9db': '#3bc9db',
  '#15aabf': '#99e9f2',
  '#0c8599': '#e3fafc',
  '#e6fcf5': '#099268',
  '#96f2d7': '#12b886',
  '#38d9a9': '#38d9a9',
  '#12b886': '#96f2d7',
  '#099268': '#e6fcf5',
  '#ebfbee': '#2f9e44',
  '#b2f2bb': '#40c057',
  '#69db7c': '#69db7c',
  '#40c057': '#b2f2bb',
  '#2f9e44': '#ebfbee',
  '#fff9db': '#f08c00',
  '#ffec99': '#fab005',
  '#ffd43b': '#ffd43b',
  '#fab005': '#ffec99',
  '#f08c00': '#fff9db',
  '#fff4e6': '#e8590c',
  '#ffd8a8': '#fd7e14',
  '#ffa94d': '#ffa94d',
  '#fd7e14': '#ffd8a8',
  '#e8590c': '#fff4e6',
};

function normalizeHex(color: string): string {
  const trimmed = color.trim().toLowerCase();
  if (trimmed === 'transparent') return 'transparent';
  if (/^#[0-9a-f]{3}$/.test(trimmed)) {
    const [, r, g, b] = trimmed.match(/^#(.)(.)(.)$/) ?? [];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return trimmed;
}

function fallbackInvertHex(hex: string): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return hex;
  const n = Number.parseInt(match[1], 16);
  const r = 255 - ((n >> 16) & 255);
  const g = 255 - ((n >> 8) & 255);
  const b = 255 - (n & 255);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export function invertBoardColor(color: string | undefined): string | undefined {
  if (!color || color === 'transparent') return color;
  const key = normalizeHex(color);
  return BOARD_COLOR_INVERT[key] ?? fallbackInvertHex(key);
}

type ColoredElement = {
  strokeColor?: string;
  backgroundColor?: string;
};

export function invertBoardElements<T extends ColoredElement>(elements: readonly T[]): T[] {
  return elements.map((el) => {
    const strokeColor = invertBoardColor(el.strokeColor);
    const backgroundColor = invertBoardColor(el.backgroundColor);
    if (strokeColor === el.strokeColor && backgroundColor === el.backgroundColor) return el;
    return newElementWith(el as unknown as Parameters<typeof newElementWith>[0], {
      strokeColor: strokeColor ?? el.strokeColor,
      backgroundColor: backgroundColor ?? el.backgroundColor,
    }) as unknown as T;
  });
}

export function elementsForBoardTheme<T extends ColoredElement>(
  elements: readonly T[],
  boardTheme: BoardCanvasTheme,
): T[] {
  if (boardTheme === 'dark') return [...elements];
  return invertBoardElements(elements);
}

export function elementsToCanonicalStorage<T extends ColoredElement>(
  elements: readonly T[],
  boardTheme: BoardCanvasTheme,
): T[] {
  return elementsForBoardTheme(elements, boardTheme);
}
