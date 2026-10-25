export const BACKGROUND_FRAME_INTERVAL_MS = 1000 / 30;
export const MAX_PARTICLES = 48;

import type { CSSProperties } from 'react';

export const BG_CONTAINER: CSSProperties = {
  position: 'absolute',
  inset: 0,
  overflow: 'hidden',
  pointerEvents: 'none',
};

export type CanvasMode = 'full' | 'quiet' | 'void';
export type ImageExtractMode = 'bright' | 'dark';

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
