import { useCallback, useEffect, useRef, useState } from 'react';

import {
  listAppleCalendarEvents,
  type AppleCalendarEvent,
} from '@features/calendar/api/appleCalendarClient';
import { isMacOsDesktop } from '@platform/macos';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { appleCalendarPollIntervalMs, readSettings } from '@shared/model/settings';

function rangeKey(timeMin: Date, timeMax: Date, calendarIds: string[]): string {
  return `${timeMin.toISOString()}|${timeMax.toISOString()}|${calendarIds.join(',')}`;
}

function isAuthFetchError(err: unknown): boolean {
  const message =
    typeof err === 'string'
      ? err
      : err instanceof Error
        ? err.message
        : err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: unknown }).message ?? '')
          : '';
  return /access not granted|access denied|write-only|restricted|unavailable/i.test(message);
}

const inFlight = new Map<string, Promise<AppleCalendarEvent[]>>();
let authFetchBlocked = false;

export function resetAppleCalendarFetchBlock(): void {
  authFetchBlocked = false;
  inFlight.clear();
}

export function useAppleCalendarEvents(
  timeMin: Date,
  timeMax: Date,
  enabled = true,
): {
  events: AppleCalendarEvent[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const settings = readSettings();
  const calendarIds = settings.appleCalendarIds;
  const key = rangeKey(timeMin, timeMax, calendarIds);
  const [events, setEvents] = useState<AppleCalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settingsTick, setSettingsTick] = useState(0);

  const rangeRef = useRef({ timeMin, timeMax, enabled, calendarIds });
  rangeRef.current = { timeMin, timeMax, enabled, calendarIds };

  const load = useCallback(async () => {
    const { timeMin: min, timeMax: max, enabled: on, calendarIds: ids } = rangeRef.current;
    if (!on || !isMacOsDesktop() || authFetchBlocked) {
      setEvents([]);
      setLoading(false);
      setError(null);
      return;
    }

    const currentSettings = readSettings();
    if (!currentSettings.appleCalendarEnabled) {
      setEvents([]);
      setLoading(false);
      setError(null);
      return;
    }

    const fetchKey = rangeKey(min, max, ids);
    setLoading(true);
    try {
      let pending = inFlight.get(fetchKey);
      if (!pending) {
        pending = listAppleCalendarEvents(min, max, ids);
        inFlight.set(fetchKey, pending);
        void pending.finally(() => {
          if (inFlight.get(fetchKey) === pending) inFlight.delete(fetchKey);
        });
      }
      const next = await pending;
      setEvents(next);
      setError(null);
    } catch (err) {
      if (isAuthFetchError(err)) {
        authFetchBlocked = true;
      }
      setError('fetch');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onSettings = (): void => {
      resetAppleCalendarFetchBlock();
      setSettingsTick((n) => n + 1);
      void load();
    };
    window.addEventListener(NORDLY_EVENTS.settingsChanged, onSettings);
    return () => window.removeEventListener(NORDLY_EVENTS.settingsChanged, onSettings);
  }, [load]);

  useEffect(() => {
    void load();
  }, [key, load, settingsTick]);

  useEffect(() => {
    if (!enabled || !isMacOsDesktop() || !readSettings().appleCalendarEnabled || authFetchBlocked) {
      return;
    }
    const tick = (): void => {
      if (document.visibilityState !== 'visible') return;
      void load();
    };
    const id = window.setInterval(tick, appleCalendarPollIntervalMs());
    return () => window.clearInterval(id);
  }, [enabled, key, load, settingsTick]);

  return {
    events,
    loading,
    error,
    refresh: () => {
      resetAppleCalendarFetchBlock();
      return load();
    },
  };
}
