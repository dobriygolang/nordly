import { useEffect, useState } from 'react';

/** Wall-clock Date that ticks while the window is visible. Flushes on resume. */
export function useNowTick(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = (): void => {
      if (document.hidden) return;
      setNow(new Date());
    };
    const id = window.setInterval(tick, intervalMs);
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') setNow(new Date());
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs]);

  return now;
}
