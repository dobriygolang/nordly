import { memo, useEffect, useState } from 'react';

import { StatsOverlayCards } from './StatsOverlayCards';

import { MOTION_MS } from '@shared/lib/motionMs';

const UNMOUNT_DELAY_MS = MOTION_MS.medium;

export const AnimatedStatsOverlay = memo(function AnimatedStatsOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): JSX.Element | null {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      return;
    }
    if (!mounted) return;
    setClosing(true);
    const t = window.setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, UNMOUNT_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [open, mounted]);

  if (!mounted) return null;
  return <StatsOverlayCards onClose={onClose} closing={closing} />;
});
