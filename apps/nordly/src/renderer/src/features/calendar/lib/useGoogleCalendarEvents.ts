import { useCallback, useEffect, useRef, useState } from 'react';

import type { GoogleCalendarEvent } from '@features/calendar/api/calendarClient';
import { isCloudEnabled } from '@shared/model/features';
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

  const peek = useCallback((): GoogleCalendarEvent[] | null => {
    if (!enabled || !isCloudEnabled()) return [];
    return peekGoogleCalendarEvents(timeMin, timeMax);
  }, [enabled, timeMin, timeMax]);

  const [events, setEvents] = useState<GoogleCalendarEvent[]>(() => peek() ?? []);
  const [loading, setLoading] = useState(() => {
    if (!enabled || !isCloudEnabled()) return false;
    return peek() === null;
  });
  const [error, setError] = useState<string | null>(null);

  const rangeRef = useRef({ timeMin, timeMax, enabled });
  rangeRef.current = { timeMin, timeMax, enabled };

  const applyCache = useCallback(() => {
    const { enabled: on } = rangeRef.current;
    if (!on || !isCloudEnabled()) {
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
  }, [peek]);

  /** Soft nudge for the worker — never assigns network results into UI state. */
  const nudgeSyncIfNeeded = useCallback(() => {
    const { timeMin: min, timeMax: max, enabled: on } = rangeRef.current;
    if (!on || !isCloudEnabled() || !canReachNetwork()) return;
    const hit = peekGoogleCalendarEvents(min, max);
    if (hit === null || isGoogleCalendarRangeStale(min, max)) {
      void refreshGoogleCalendarCache();
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled || !isCloudEnabled()) {
      setEvents([]);
      setLoading(false);
      return;
    }
    await refreshGoogleCalendarCache();
    applyCache();
  }, [enabled, applyCache]);

  useEffect(() => {
    if (!enabled || !isCloudEnabled()) {
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
  }, [rangeKey, enabled, peek, applyCache, nudgeSyncIfNeeded]);

  useEffect(() => subscribeGoogleCalendarCache(applyCache), [applyCache]);

  useEffect(() => {
    if (!isCloudEnabled()) return;
    const onChanged = () => applyCache();
    window.addEventListener(NORDLY_EVENTS.googleCalendarChanged, onChanged);
    return () => window.removeEventListener(NORDLY_EVENTS.googleCalendarChanged, onChanged);
  }, [applyCache]);

  return {
    events,
    loading,
    error,
    refresh,
  };
}
