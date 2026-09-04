import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { visibleDayColumnRange } from '@features/tasks/lib/visibleDayColumnRange';
import {
  buildDayWindow,
  differenceInCalendarDays,
  parseDayKey,
  toDayKey,
  type DayKey,
} from '@shared/lib/dates';

export const DAY_COL_WIDTH = 270;
export const DAY_COL_GAP = 12;
export const DAY_COL_STRIDE = DAY_COL_WIDTH + DAY_COL_GAP;

const INITIAL_PAST = 14;
const INITIAL_FUTURE = 21;
const BATCH = 14;
const EDGE_THRESHOLD_COLS = 3;
const FAR_FROM_TODAY_COLS = 7;
const SCROLL_IDLE_MS = 150;
const AUTO_EXPAND_PAST = 30;
const AUTO_EXPAND_FUTURE = 45;

interface UseInfiniteDayScrollResult {
  days: DayKey[];
  visibleRange: { first: number; last: number };
  scrollRef: React.RefObject<HTMLDivElement>;
  showBackToToday: boolean;
  scrollToToday: () => void;
  ensureDayVisible: (dayKey: string) => void;
  expandRangeForDayKeys: (dayKeys: string[]) => void;
}

export function useInfiniteDayScroll(today: Date): UseInfiniteDayScrollResult {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [rangeStart, setRangeStart] = useState(-INITIAL_PAST);
  const [rangeEnd, setRangeEnd] = useState(INITIAL_FUTURE);
  const [showBackToToday, setShowBackToToday] = useState(false);
  const [returningToToday, setReturningToToday] = useState(false);
  const [visibleRange, setVisibleRange] = useState({ first: 0, last: INITIAL_PAST + INITIAL_FUTURE });

  const scrollAdjustRef = useRef(0);
  const loadingPastRef = useRef(false);
  const loadingFutureRef = useRef(false);
  const didInitialScrollRef = useRef(false);
  const pendingScrollTodayRef = useRef(false);
  const pendingScrollDayKeyRef = useRef<string | null>(null);
  const returningToTodayRef = useRef(false);
  const scrollIdleTimerRef = useRef<number | null>(null);
  const scrollSettledRef = useRef(true);
  const farFromTodayRef = useRef(false);

  const todayKey = toDayKey(today);

  const days = useMemo(
    () => buildDayWindow(today, -rangeStart, rangeEnd),
    [today, rangeStart, rangeEnd],
  );

  const todayIndex = useMemo(
    () => days.findIndex((d) => d.key === todayKey),
    [days, todayKey],
  );

  const syncVisibleRange = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const next = visibleDayColumnRange(el.scrollLeft, el.clientWidth, days.length, DAY_COL_STRIDE);
    setVisibleRange((prev) => (prev.first === next.first && prev.last === next.last ? prev : next));
  }, [days.length]);

  const syncBackButton = useCallback(() => {
    const el = scrollRef.current;
    if (!el || todayIndex < 0 || returningToTodayRef.current) {
      setShowBackToToday(false);
      farFromTodayRef.current = false;
      return;
    }
    const todayLeft = todayIndex * DAY_COL_STRIDE;
    const viewCenter = el.scrollLeft + el.clientWidth / 2;
    const todayCenter = todayLeft + DAY_COL_WIDTH / 2;
    const dayOffset = Math.round((viewCenter - todayCenter) / DAY_COL_STRIDE);
    const far = Math.abs(dayOffset) >= FAR_FROM_TODAY_COLS;
    farFromTodayRef.current = far;
    const next = far && scrollSettledRef.current;
    setShowBackToToday((prev) => (prev === next ? prev : next));
  }, [todayIndex]);

  const scheduleBackButtonSync = useCallback(() => {
    if (scrollIdleTimerRef.current !== null) {
      window.clearTimeout(scrollIdleTimerRef.current);
    }
    scrollSettledRef.current = false;
    // Only hide once per gesture. Re-dispatching on every scroll event re-rendered
    // the whole unvirtualized board (~35 columns) mid-scroll.
    setShowBackToToday((prev) => (prev ? false : prev));

    scrollIdleTimerRef.current = window.setTimeout(() => {
      scrollIdleTimerRef.current = null;
      scrollSettledRef.current = true;
      syncBackButton();
    }, SCROLL_IDLE_MS);
  }, [syncBackButton]);

  const extendPast = useCallback(() => {
    if (loadingPastRef.current) return;
    loadingPastRef.current = true;
    scrollAdjustRef.current += BATCH * DAY_COL_STRIDE;
    setRangeStart((s) => s - BATCH);
  }, []);

  const extendFuture = useCallback(() => {
    if (loadingFutureRef.current) return;
    loadingFutureRef.current = true;
    setRangeEnd((e) => e + BATCH);
  }, []);

  const extendRangeStartTo = useCallback((minOffset: number) => {
    setRangeStart((s) => {
      const next = Math.min(s, minOffset - BATCH);
      const prepended = Math.max(0, -next - -s);
      if (prepended > 0) {
        scrollAdjustRef.current += prepended * DAY_COL_STRIDE;
      }
      return next;
    });
  }, []);

  const scrollToDayIndex = useCallback((index: number, behavior: ScrollBehavior = 'smooth') => {
    const el = scrollRef.current;
    if (!el || index < 0) return;
    el.scrollTo({
      left: Math.max(0, index * DAY_COL_STRIDE - el.clientWidth * 0.35),
      behavior,
    });
  }, []);

  const scrollToToday = useCallback(() => {
    returningToTodayRef.current = true;
    setReturningToToday(true);
    setShowBackToToday(false);
    farFromTodayRef.current = false;
    pendingScrollTodayRef.current = true;
    pendingScrollDayKeyRef.current = null;
    setRangeStart(-INITIAL_PAST);
    setRangeEnd(INITIAL_FUTURE);
  }, []);

  const ensureDayVisible = useCallback(
    (dayKey: string) => {
      if (returningToTodayRef.current) return;
      const target = parseDayKey(dayKey);
      const offset = differenceInCalendarDays(target, today);
      extendRangeStartTo(offset);
      setRangeEnd((e) => Math.max(e, offset + BATCH));
      pendingScrollTodayRef.current = false;
      pendingScrollDayKeyRef.current = dayKey;
    },
    [today, extendRangeStartTo],
  );

  const expandRangeForDayKeys = useCallback(
    (dayKeys: string[]) => {
      if (dayKeys.length === 0 || returningToTodayRef.current) return;
      let minOffset = 0;
      let maxOffset = 0;
      let hasOffset = false;
      for (const dayKey of dayKeys) {
        const target = parseDayKey(dayKey);
        const rawOffset = differenceInCalendarDays(target, today);
        const offset = Math.max(-AUTO_EXPAND_PAST, Math.min(AUTO_EXPAND_FUTURE, rawOffset));
        if (!hasOffset) {
          minOffset = offset;
          maxOffset = offset;
          hasOffset = true;
        } else {
          minOffset = Math.min(minOffset, offset);
          maxOffset = Math.max(maxOffset, offset);
        }
      }
      if (!hasOffset) return;
      extendRangeStartTo(minOffset);
      setRangeEnd((e) => Math.max(e, maxOffset + BATCH));
    },
    [today, extendRangeStartTo],
  );

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    if (scrollAdjustRef.current !== 0) {
      el.scrollLeft += scrollAdjustRef.current;
      scrollAdjustRef.current = 0;
      loadingPastRef.current = false;
    }

    if (loadingFutureRef.current) {
      loadingFutureRef.current = false;
    }

    if (!didInitialScrollRef.current && todayIndex >= 0) {
      scrollToDayIndex(todayIndex, 'auto');
      didInitialScrollRef.current = true;
      syncBackButton();
      syncVisibleRange();
      return;
    }

    if (pendingScrollTodayRef.current && todayIndex >= 0) {
      scrollToDayIndex(todayIndex, 'auto');
      pendingScrollTodayRef.current = false;
      returningToTodayRef.current = false;
      setReturningToToday(false);
      scrollSettledRef.current = true;
      syncBackButton();
      syncVisibleRange();
      return;
    }

    if (pendingScrollDayKeyRef.current) {
      const idx = days.findIndex((d) => d.key === pendingScrollDayKeyRef.current);
      if (idx >= 0) {
        scrollToDayIndex(idx, 'auto');
        pendingScrollDayKeyRef.current = null;
        syncBackButton();
        syncVisibleRange();
      }
    } else {
      syncVisibleRange();
    }
  }, [days, todayIndex, scrollToDayIndex, syncBackButton, syncVisibleRange]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let raf = 0;
    const onScroll = () => {
      scheduleBackButtonSync();
      if (raf === 0) {
        raf = window.requestAnimationFrame(() => {
          raf = 0;
          syncVisibleRange();
        });
      }

      if (returningToTodayRef.current) return;

      const threshold = EDGE_THRESHOLD_COLS * DAY_COL_STRIDE;
      if (el.scrollLeft < threshold) {
        extendPast();
      } else if (el.scrollLeft + el.clientWidth > el.scrollWidth - threshold) {
        extendFuture();
      }
    };

    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (raf !== 0) window.cancelAnimationFrame(raf);
      if (scrollIdleTimerRef.current !== null) {
        window.clearTimeout(scrollIdleTimerRef.current);
      }
    };
  }, [scheduleBackButtonSync, extendPast, extendFuture, days.length, syncVisibleRange]);

  return {
    days,
    visibleRange,
    scrollRef,
    showBackToToday: showBackToToday && !returningToToday,
    scrollToToday,
    ensureDayVisible,
    expandRangeForDayKeys,
  };
}
