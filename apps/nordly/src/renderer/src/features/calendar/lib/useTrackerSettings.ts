import { useSyncExternalStore } from 'react';

import type { TrackerSettings } from '@features/calendar/api/calendarClient';
import type { CalendarProviderError } from '@features/calendar/model/provider';

import {
  getGoogleCalendarConnection,
  type GoogleCalendarConnectionStatus,
  refreshGoogleCalendarConnection,
  subscribeGoogleCalendarConnection,
} from './googleCalendarConnectionStore';

/** Shared tracker settings — same fetch/TTL as Google connection. */
export function useTrackerSettings(): {
  settings: TrackerSettings | null;
  status: GoogleCalendarConnectionStatus;
  ready: boolean;
  error: CalendarProviderError | null;
  refresh: () => Promise<void>;
} {
  const snapshot = useSyncExternalStore(
    subscribeGoogleCalendarConnection,
    getGoogleCalendarConnection,
    getGoogleCalendarConnection,
  );
  return {
    settings: snapshot.settings,
    status: snapshot.status,
    ready: snapshot.ready,
    error: snapshot.error,
    refresh: refreshGoogleCalendarConnection,
  };
}
