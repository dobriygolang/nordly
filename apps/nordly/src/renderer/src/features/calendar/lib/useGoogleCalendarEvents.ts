import { useCallback, useEffect, useRef, useState } from 'react';

import type { GoogleCalendarEvent } from '@features/calendar/api/calendarClient';
import type { CalendarProviderError } from '@features/calendar/model/provider';
import { isCloudEnabled } from '@shared/model/features';
import { canReachNetwork } from '@shared/lib/network';

import {
  googleCalendarLastError,
  hydrateGoogleCalendarCache,
  isGoogleCalendarRangeStale,
  isInsideDefaultGoogleSyncWindow,
  peekGoogleCalendarEvents,
  prefetchGoogleCalendarEvents,
  reportGoogleCalendarError,
  subscribeGoogleCalendarCache,
  googleRangeKey,
} from './googleCalendarCache';
import { refreshGoogleCalendarCache } from './googleCalendarSyncWorker';

/**
 * Display hook — reads only the local Google Calendar snapshot (memory + IndexedDB).
 * Network refresh is owned by `googleCalendarSyncWorker` (poll → local → notify).
 */
export function useGoogleCalendarEvents(
  timeMin: Date,
  timeMax: Date,
  enabled = true,
): {
  events: GoogleCalendarEvent[];
  loading: boolean;
  error: CalendarProviderError | null;
  refresh: () => Promise<void>;
} {
  const rangeKey = googleRangeKey(timeMin, timeMax);
  const googleAvailable = isCloudEnabled();

  const peek = useCallback((): GoogleCalendarEvent[] | null => {
    if (!enabled || !googleAvailable) return [];
    return peekGoogleCalendarEvents(timeMin, timeMax);
  }, [enabled, googleAvailable, timeMin, timeMax]);

  const [events, setEvents] = useState<GoogleCalendarEvent[]>(() => {
    const hit = peek();
    return hit === null ? [] : hit;
  });
  const [loading, setLoading] = useState(() => {
    if (!enabled || !googleAvailable) return false;
    return peek() === null;
  });
  const [error, setError] = useState<CalendarProviderError | null>(null);

  const rangeRef = useRef({ timeMin, timeMax, enabled });
  rangeRef.current = { timeMin, timeMax, enabled };

  const applyCache = useCallback(() => {
    const { enabled: on } = rangeRef.current;
    if (!on || !googleAvailable) {
      setEvents([]);
      setLoading(false);
      setError(null);
      return;
    }
    const hit = peek();
    if (hit === null) {
      setEvents([]);
      setLoading(true);
      const cacheErr = googleCalendarLastError();
      setError(cacheErr);
      return;
    }
    setEvents(hit);
    setLoading(false);
    const cacheErr = googleCalendarLastError();
    setError(cacheErr);
  }, [peek, googleAvailable]);

  /** Soft nudge for the worker — never assigns network results into UI state. */
  const nudgeSyncIfNeeded = useCallback(() => {
    const { timeMin: min, timeMax: max, enabled: on } = rangeRef.current;
    if (!on || !googleAvailable || !canReachNetwork() || document.hidden) return;
    const hit = peekGoogleCalendarEvents(min, max);
    if (hit === null) {
      if (isInsideDefaultGoogleSyncWindow(min, max)) {
        void refreshGoogleCalendarCache();
        return;
      }
      void prefetchGoogleCalendarEvents(min, max).catch((err: unknown) => {
        reportGoogleCalendarError(err);
      });
      return;
    }
    if (isGoogleCalendarRangeStale(min, max)) {
      void refreshGoogleCalendarCache();
    }
  }, [googleAvailable]);

  const refresh = useCallback(async () => {
    if (!enabled || !googleAvailable) {
      setEvents([]);
      setLoading(false);
      return;
    }
    await refreshGoogleCalendarCache();
    applyCache();
  }, [enabled, googleAvailable, applyCache]);

  useEffect(() => {
    if (!enabled || !googleAvailable) {
      setEvents([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    applyCache();
    void (async () => {
      await hydrateGoogleCalendarCache();
      if (cancelled) return;
      applyCache();
      nudgeSyncIfNeeded();
    })();

    return () => {
      cancelled = true;
    };
  }, [rangeKey, enabled, googleAvailable, peek, applyCache, nudgeSyncIfNeeded]);

  useEffect(() => subscribeGoogleCalendarCache(applyCache), [applyCache]);

  return {
    events,
    loading,
    error,
    refresh,
  };
}
