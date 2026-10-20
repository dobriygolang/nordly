import { useEffect, useRef } from 'react';

import { isHorizontalSwipe, StatsSwipeGesture, statsSwipeAction } from '@shared/lib/statsSwipe';

interface HomeStatsSwipeDeps {
  enabled: boolean;
  statsOpen: boolean;
  openStats: () => void;
  closeStats: () => void;
}

function isInsideHorizontalScroller(target: EventTarget | null): boolean {
  let node = target instanceof Element ? target : null;
  while (node && node !== document.body) {
    const overflowX = getComputedStyle(node).overflowX;
    if (
      (overflowX === 'auto' || overflowX === 'scroll') &&
      node.scrollWidth > node.clientWidth + 1
    ) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

/** Two-finger trackpad swipe on the home page: left opens stats, right closes it. */
export function useHomeStatsSwipe(deps: HomeStatsSwipeDeps): void {
  const depsRef = useRef(deps);
  depsRef.current = deps;

  useEffect(() => {
    const gesture = new StatsSwipeGesture();
    const onWheel = (event: WheelEvent): void => {
      const current = depsRef.current;
      if (!current.enabled) return;
      if (!isHorizontalSwipe(event.deltaX, event.deltaY)) return;
      if (isInsideHorizontalScroller(event.target)) return;
      const total = gesture.push(event.deltaX, performance.now());
      if (total == null) return;
      const action = statsSwipeAction(total, current.statsOpen);
      if (!action) return;
      event.preventDefault();
      if (action === 'open') current.openStats();
      else current.closeStats();
    };
    window.addEventListener('wheel', onWheel, { capture: true, passive: false });
    return () => window.removeEventListener('wheel', onWheel, { capture: true });
  }, []);
}
