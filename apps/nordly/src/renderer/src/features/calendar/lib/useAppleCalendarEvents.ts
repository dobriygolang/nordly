import { useCallback, useEffect, useSyncExternalStore } from 'react';

import type { AppleCalendarEvent } from '@features/calendar/api/appleCalendarClient';
import type { CalendarProviderError } from '@features/calendar/model/provider';

import {
  appleCalendarFetchKey,
  getAppleCalendarSlice,
  refreshAppleCalendarRange,
  resetAppleCalendarFetchBlock,
  subscribeAppleCalendarEvents,
  watchAppleCalendarRange,
} from './appleCalendarEventsStore';

export { resetAppleCalendarFetchBlock };

export function useAppleCalendarEvents(
  timeMin: Date,
  timeMax: Date,
  enabled = true,
): {
  events: AppleCalendarEvent[];
  loading: boolean;
  error: CalendarProviderError | null;
  refresh: () => Promise<void>;
} {
  const key = appleCalendarFetchKey(timeMin, timeMax);
  const getSlice = useCallback(() => getAppleCalendarSlice(key), [key]);

  useEffect(
    () => watchAppleCalendarRange(timeMin, timeMax, enabled),
    [key, enabled, timeMin, timeMax],
  );

  const slice = useSyncExternalStore(subscribeAppleCalendarEvents, getSlice, getSlice);

  return {
    events: slice.events,
    loading: slice.loading,
    error: slice.error,
    refresh: () => refreshAppleCalendarRange(timeMin, timeMax),
  };
}
