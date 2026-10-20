import { useEffect, useRef } from 'react';

import { isHorizontalSwipe, StatsSwipeGesture, statsSwipeAction } from '@shared/lib/statsSwipe';

interface HomeStatsSwipeDeps {
  enabled: boolean;
  statsOpen: boolean;
  openStats: () => void;
  closeStats: () => void;
}

function consumesHorizontalSwipe(target: EventTarget | null): boolean {
  let node = target instanceof Element ? target : null;
  while (node && node !== document.documentElement) {
    if (node.classList.contains('nordly-stats-overlay')) {
      node = node.parentElement;
      continue;
    }
    if (node instanceof HTMLElement) {
      const overflowX = getComputedStyle(node).overflowX;
      if (overflowX === 'auto' || overflowX === 'scroll') {
        const scrollbar = Math.max(0, node.offsetWidth - node.clientWidth);
        if (node.scrollWidth > node.clientWidth + scrollbar + 2) return true;
      }
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
      if (!isHorizontalSwipe(event.deltaX, event.deltaY)) return;
      if (consumesHorizontalSwipe(event.target)) return;
      event.preventDefault();
      const current = depsRef.current;
      if (!current.enabled) return;
      const total = gesture.push(event.deltaX, performance.now());
      if (total == null) return;
      const action = statsSwipeAction(total, current.statsOpen);
      if (!action) return;
      if (action === 'open') current.openStats();
      else current.closeStats();
    };
    window.addEventListener('wheel', onWheel, { capture: true, passive: false });
    return () => window.removeEventListener('wheel', onWheel, { capture: true });
  }, []);
}
