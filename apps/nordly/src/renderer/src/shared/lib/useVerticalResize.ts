import { useCallback, useEffect, useRef, useState } from 'react';

const MOVE_THRESHOLD_PX = 3;

interface ResizeConfig {
  id: string;
  baseHeight: number;
  min: number;
  max: number;
  onCommit: (height: number) => void;
}

interface Session extends ResizeConfig {
  startY: number;
  pointerId: number;
  el: HTMLElement;
  moved: boolean;
}

/** Vertical resize for absolutely-positioned time blocks (bottom edge). */
export function useVerticalResize(): {
  resizeId: string | null;
  resizeHeight: number;
  start: (e: React.PointerEvent, cfg: ResizeConfig) => void;
} {
  const [active, setActive] = useState<{ id: string; height: number } | null>(null);
  const sessionRef = useRef<Session | null>(null);

  const start = useCallback((e: React.PointerEvent, cfg: ResizeConfig) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    sessionRef.current = {
      ...cfg,
      startY: e.clientY,
      pointerId: e.pointerId,
      el,
      moved: false,
    };
    setActive({ id: cfg.id, height: cfg.baseHeight });
  }, []);

  useEffect(() => {
    const clampHeight = (s: Session, dy: number) =>
      Math.max(s.min, Math.min(s.max, s.baseHeight + dy));

    const onMove = (e: PointerEvent) => {
      const s = sessionRef.current;
      if (!s || e.pointerId !== s.pointerId) return;
      const dy = e.clientY - s.startY;
      if (Math.abs(dy) > MOVE_THRESHOLD_PX) s.moved = true;
      setActive({ id: s.id, height: clampHeight(s, dy) });
    };

    const finish = (e: PointerEvent) => {
      const s = sessionRef.current;
      if (!s || e.pointerId !== s.pointerId) return;
      const height = clampHeight(s, e.clientY - s.startY);
      try {
        s.el.releasePointerCapture(s.pointerId);
      } catch {
        /* ignore */
      }
      sessionRef.current = null;
      setActive(null);
      if (s.moved) s.onCommit(height);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
  }, []);

  return { resizeId: active?.id ?? null, resizeHeight: active?.height ?? 0, start };
}
