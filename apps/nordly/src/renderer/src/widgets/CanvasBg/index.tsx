import { DEFAULT_THEME_ID, type ThemeId } from '@shared/model/theme';

import { ImageBg } from './ImageBg';
import { ParticlesBg } from './ParticlesBg';
import { prefersReducedMotion, type CanvasMode } from './types';
import { WinterBg } from './WinterBg';

export type { CanvasMode } from './types';

interface CanvasBgProps {
  mode?: CanvasMode;
  theme?: ThemeId;
  boost?: boolean;
  animated?: boolean;
}

export function CanvasBg({
  mode = 'full',
  theme = DEFAULT_THEME_ID,
  boost = false,
  animated = true,
}: CanvasBgProps) {
  const effectiveAnimated = animated && mode === 'full' && !prefersReducedMotion();
  if (mode === 'void') return null;
  switch (theme) {
    case 'drift':
      return (
        <ImageBg
          mode={mode}
          src="/backgrounds/drift.png"
          boost={boost}
          animated={effectiveAnimated}
          extract="dark"
        />
      );
    case 'visor':
      return (
        <ImageBg
          mode={mode}
          src="/backgrounds/visor.png"
          boost={boost}
          animated={effectiveAnimated}
          extract="dark"
        />
      );
    case 'debris':
      return <ImageBg mode={mode} src="/backgrounds/debris.png" boost={boost} animated={effectiveAnimated} />;
    case 'launch':
      return <ImageBg mode={mode} src="/backgrounds/launch.png" boost={boost} animated={effectiveAnimated} />;
    case 'birthday-light':
      return (
        <ImageBg
          mode={mode}
          src="/backgrounds/birthday-light.png"
          boost={boost}
          animated={effectiveAnimated}
          extract="dark"
        />
      );
    case 'particles':
      return <ParticlesBg mode={mode} animated={effectiveAnimated} />;
    case 'winter':
    default:
      return <WinterBg mode={mode} animated={effectiveAnimated} />;
  }
}
