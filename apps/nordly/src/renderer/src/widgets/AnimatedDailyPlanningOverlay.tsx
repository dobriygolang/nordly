import { Suspense, lazy, memo, useEffect, useState } from 'react';

const DailyPlanningModal = lazy(() =>
  import('@pages/DailyPlanning/DailyPlanningModal').then((m) => ({ default: m.DailyPlanningModal })),
);

const UNMOUNT_DELAY_MS = 320;

export const AnimatedDailyPlanningOverlay = memo(function AnimatedDailyPlanningOverlay({
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
  return (
    <Suspense fallback={null}>
      <DailyPlanningModal onClose={onClose} closing={closing} />
    </Suspense>
  );
});
