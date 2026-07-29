import { useCallback, useEffect, useRef, useState } from 'react';

import type { GoogleCalendarEvent } from '@features/calendar/api/calendarClient';
import { isGoogleIntegrationAvailable } from '@shared/model/features';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { canReachNetwork } from '@shared/sync/syncConfig';

import {
  hydrateGoogleCalendarCache,
  isGoogleCalendarRangeStale,
  peekGoogleCalendarEvents,
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
  error: string | null;
  refresh: () => Promise<void>;
} {
  const rangeKey = googleRangeKey(timeMin, timeMax);
  const googleAvailable = isGoogleIntegrationAvailable();

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
  const [error, setError] = useState<string | null>(null);

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
      setLoading(true);
      return;
    }
    setEvents(hit);
    setLoading(false);
    setError(null);
  }, [peek, googleAvailable]);

  /** Soft nudge for the worker — never assigns network results into UI state. */
  const nudgeSyncIfNeeded = useCallback(() => {
    const { timeMin: min, timeMax: max, enabled: on } = rangeRef.current;
    if (!on || !googleAvailable || !canReachNetwork()) return;
    const hit = peekGoogleCalendarEvents(min, max);
    if (hit === null || isGoogleCalendarRangeStale(min, max)) {
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
    setLoading(peek() === null);
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

  useEffect(() => {
    if (!googleAvailable) return;
    const onChanged = () => applyCache();
    window.addEventListener(NORDLY_EVENTS.googleCalendarChanged, onChanged);
    return () => window.removeEventListener(NORDLY_EVENTS.googleCalendarChanged, onChanged);
  }, [applyCache, googleAvailable]);

  return {
    events,
    loading,
    error,
    refresh,
  };
}
