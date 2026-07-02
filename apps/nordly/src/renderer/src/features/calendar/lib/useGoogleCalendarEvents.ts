import { useCallback, useEffect, useRef, useState } from 'react';

import { GoogleReauthError, type GoogleCalendarEvent } from '@features/calendar/api/calendarClient';
import { isCloudEnabled } from '@shared/model/features';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';

import {
  fetchGoogleCalendarEvents,
  peekGoogleCalendarEvents,
  subscribeGoogleCalendarCache,
  googleRangeKey,
} from './googleCalendarCache';

export function useGoogleCalendarEvents(
  timeMin: Date,
  timeMax: Date,
  enabled = true,
): {
  events: GoogleCalendarEvent[];
  loading: boolean;
  error: string | null;
  reauthRequired: boolean;
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
  const [reauthRequired, setReauthRequired] = useState(false);

  const rangeRef = useRef({ timeMin, timeMax, enabled });
  rangeRef.current = { timeMin, timeMax, enabled };

  const applyCache = useCallback(() => {
    const hit = peek();
    if (hit === null) return;
    setEvents(hit);
    setLoading(false);
  }, [peek]);

  const load = useCallback(async (force = false) => {
    const { timeMin: min, timeMax: max, enabled: on } = rangeRef.current;
    if (!on || !isCloudEnabled()) {
      setEvents([]);
      setLoading(false);
      setError(null);
      setReauthRequired(false);
      return;
    }

    const cached = peekGoogleCalendarEvents(min, max);
    if (cached !== null) {
      setEvents(cached);
      setLoading(false);
      setError(null);
      setReauthRequired(false);
      if (!force) return;
    } else {
      setLoading(true);
    }

    try {
      const next = await fetchGoogleCalendarEvents(min, max, { force: true });
      setEvents(next);
      setError(null);
      setReauthRequired(false);
    } catch (err) {
      if (err instanceof GoogleReauthError) {
        setReauthRequired(true);
        setError('reauth');
      } else {
        setError('fetch');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const hit = peek();
    setEvents(hit ?? []);
    setLoading(hit === null);
    void load(false);
  }, [rangeKey, load, peek]);

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
    reauthRequired,
    refresh: () => load(true),
  };
}
