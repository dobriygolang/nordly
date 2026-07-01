import { memo, useEffect, useState } from 'react';

import { DailyPlanningModal } from '@pages/DailyPlanning/DailyPlanningModal';

const UNMOUNT_DELAY_MS = 320;

export const AnimatedDailyPlanningOverlay = memo(function AnimatedDailyPlanningOverlay({
  open,
  onClose,
  onComplete,
}: {
  open: boolean;
  onClose: () => void;
  onComplete?: () => void;
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
  return <DailyPlanningModal onClose={onClose} onComplete={onComplete} closing={closing} />;
});
