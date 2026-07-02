import { useCallback, useEffect, useRef, useState } from 'react';

import {
  CALENDAR_GRID_END_HOUR,
  CALENDAR_GRID_START_HOUR,
} from '@features/calendar/lib/events';
import { snapMinutes } from '@shared/lib/dates';

const MOVE_THRESHOLD_PX = 4;
const MIN_DURATION_MIN = 15;

export interface CalendarRangeSelection {
  dayKey: string;
  top: number;
  height: number;
}

interface Session {
  dayKey: string;
  columnEl: HTMLElement;
  pointerId: number;
  anchorTop: number;
  moved: boolean;
}

function clampOffset(offsetTop: number, gridHeight: number): number {
  return Math.max(0, Math.min(gridHeight, offsetTop));
}

function offsetToMinutes(offsetTop: number, hourHeight: number): number {
  const raw = (offsetTop / hourHeight + CALENDAR_GRID_START_HOUR) * 60;
  const minBound = CALENDAR_GRID_START_HOUR * 60;
  const maxBound = CALENDAR_GRID_END_HOUR * 60;
  return Math.max(minBound, Math.min(maxBound, snapMinutes(raw)));
}

function minutesToOffset(totalMin: number, hourHeight: number): number {
  return ((totalMin - CALENDAR_GRID_START_HOUR * 60) / 60) * hourHeight;
}

function dateFromMinutes(dayKey: string, totalMin: number): Date {
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(y, m - 1, d, Math.floor(totalMin / 60), totalMin % 60, 0, 0);
}

function rangeLayout(
  anchorTop: number,
  currentTop: number,
  hourHeight: number,
  gridHeight: number,
): { top: number; height: number; startMin: number; endMin: number } {
  const startMin = offsetToMinutes(Math.min(anchorTop, currentTop), hourHeight);
  let endMin = offsetToMinutes(Math.max(anchorTop, currentTop), hourHeight);
  if (endMin <= startMin) endMin = startMin + MIN_DURATION_MIN;

  const top = minutesToOffset(startMin, hourHeight);
  const height = Math.max(
    minutesToOffset(endMin, hourHeight) - top,
    (MIN_DURATION_MIN / 60) * hourHeight,
  );
  const maxTop = gridHeight - height;
  return {
    top: Math.max(0, Math.min(top, maxTop)),
    height: Math.min(height, gridHeight),
    startMin,
    endMin,
  };
}

/**
 * Drag on an empty week column to select a time range (Google Calendar style).
 * Commits only after pointer movement past the click threshold.
 */
export function useCalendarRangeSelect(options: {
  hourHeight: number;
  gridHeight: number;
  onCommit: (payload: { dayKey: string; start: Date; end: Date }) => void;
}): {
  selection: CalendarRangeSelection | null;
  onColumnPointerDown: (dayKey: string, e: React.PointerEvent<HTMLElement>) => void;
} {
  const { hourHeight, gridHeight, onCommit } = options;
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  const [selection, setSelection] = useState<CalendarRangeSelection | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const metricsRef = useRef({ hourHeight, gridHeight });
  metricsRef.current = { hourHeight, gridHeight };

  const onColumnPointerDown = useCallback((dayKey: string, e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('.nordly-calendar-event')) return;

    const columnEl = e.currentTarget;
    const rect = columnEl.getBoundingClientRect();
    const anchorTop = clampOffset(e.clientY - rect.top, metricsRef.current.gridHeight);

    try {
      columnEl.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    sessionRef.current = {
      dayKey,
      columnEl,
      pointerId: e.pointerId,
      anchorTop,
      moved: false,
    };
    setSelection({ dayKey, top: anchorTop, height: (MIN_DURATION_MIN / 60) * metricsRef.current.hourHeight });
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const s = sessionRef.current;
      if (!s || e.pointerId !== s.pointerId) return;

      const { hourHeight: hh, gridHeight: gh } = metricsRef.current;
      const rect = s.columnEl.getBoundingClientRect();
      const currentTop = clampOffset(e.clientY - rect.top, gh);
      if (Math.abs(currentTop - s.anchorTop) > MOVE_THRESHOLD_PX) s.moved = true;

      const layout = rangeLayout(s.anchorTop, currentTop, hh, gh);
      setSelection({ dayKey: s.dayKey, top: layout.top, height: layout.height });
    };

    const finish = (e: PointerEvent) => {
      const s = sessionRef.current;
      if (!s || e.pointerId !== s.pointerId) return;

      const { hourHeight: hh, gridHeight: gh } = metricsRef.current;
      const rect = s.columnEl.getBoundingClientRect();
      const currentTop = clampOffset(e.clientY - rect.top, gh);

      try {
        s.columnEl.releasePointerCapture(s.pointerId);
      } catch {
        /* ignore */
      }
      sessionRef.current = null;
      setSelection(null);

      if (!s.moved) return;

      const layout = rangeLayout(s.anchorTop, currentTop, hh, gh);
      onCommitRef.current({
        dayKey: s.dayKey,
        start: dateFromMinutes(s.dayKey, layout.startMin),
        end: dateFromMinutes(s.dayKey, layout.endMin),
      });
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

  return { selection, onColumnPointerDown };
}
