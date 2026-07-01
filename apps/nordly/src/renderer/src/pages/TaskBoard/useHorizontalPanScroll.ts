import { useEffect, type RefObject } from 'react';

const PAN_THRESHOLD_PX = 4;

/** Click-drag horizontal scroll for mouse users (trackpad scroll still works natively). */
export function useHorizontalPanScroll(
  scrollRef: RefObject<HTMLDivElement | null>,
  enabled: boolean,
): void {
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !enabled) return;

    let session: { pointerId: number; startX: number; startScrollLeft: number; active: boolean } | null =
      null;
    let suppressClick = false;

    const finish = (e: PointerEvent) => {
      if (!session || e.pointerId !== session.pointerId) return;
      if (session.active) suppressClick = true;
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      el.classList.remove('nordly-task-board-scroll--panning');
      session = null;
    };

    const onClick = (e: MouseEvent) => {
      if (!suppressClick) return;
      suppressClick = false;
      e.preventDefault();
      e.stopPropagation();
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest('[data-task-row], button, textarea, input, select, [data-no-pan]')) return;

      session = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startScrollLeft: el.scrollLeft,
        active: false,
      };
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    const onMove = (e: PointerEvent) => {
      if (!session || e.pointerId !== session.pointerId) return;
      const dx = e.clientX - session.startX;
      if (!session.active) {
        if (Math.abs(dx) < PAN_THRESHOLD_PX) return;
        session.active = true;
        el.classList.add('nordly-task-board-scroll--panning');
      }
      e.preventDefault();
      el.scrollLeft = session.startScrollLeft - dx;
    };

    const onUp = (e: PointerEvent) => {
      if (!session || e.pointerId !== session.pointerId) return;
      if (session.active) e.preventDefault();
      finish(e);
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('click', onClick, true);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('click', onClick, true);
      el.classList.remove('nordly-task-board-scroll--panning');
    };
  }, [scrollRef, enabled]);
}
