import { readSettings, type TextScale } from '@shared/model/settings';

export type { TextScale };

export function readTextScale(): TextScale {
  return readSettings().textScale;
}

export function applyTextScale(scale: TextScale): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.textScale = scale;
}
