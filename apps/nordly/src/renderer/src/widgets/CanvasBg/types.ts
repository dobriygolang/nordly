export const GRID_STEP_PX = 64;
export const BACKGROUND_FRAME_INTERVAL_MS = 1000 / 30;
export const MAX_PARTICLES = 48;

import type { CSSProperties } from 'react';

export const BG_CONTAINER: CSSProperties = {
  position: 'absolute',
  inset: 0,
  overflow: 'hidden',
  pointerEvents: 'none',
};

export const WAVES = [
  { d: 'M-200,260 C 260,180 480,360 760,290 S 1240,220 1900,250', dur: '17s', delay: '0s', anim: 'wave-drift', op: 0.22, sw: 1 },
  { d: 'M-200,400 C 240,360 520,460 880,400 S 1320,320 1900,400', dur: '23s', delay: '-3s', anim: 'wave-tilt', op: 0.18, sw: 1 },
  { d: 'M-200,520 C 280,500 580,600 900,540 S 1380,440 1900,500', dur: '29s', delay: '-7s', anim: 'wave-drift', op: 0.20, sw: 1 },
  { d: 'M-200,640 C 320,610 660,720 980,660 S 1420,580 1900,620', dur: '31s', delay: '-11s', anim: 'wave-tilt', op: 0.16, sw: 1 },
  { d: 'M-200,760 C 360,740 700,800 1020,760 S 1460,720 1900,750', dur: '37s', delay: '-19s', anim: 'wave-drift', op: 0.14, sw: 1 },
];

export type CanvasMode = 'full' | 'quiet' | 'void';
export type ImageExtractMode = 'bright' | 'dark';

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
