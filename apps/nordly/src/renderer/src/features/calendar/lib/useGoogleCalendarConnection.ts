import { useSyncExternalStore } from 'react';

import {
  getGoogleCalendarConnection,
  GoogleCalendarConnectionStatus,
  refreshGoogleCalendarConnection,
  subscribeGoogleCalendarConnection,
} from './googleCalendarConnectionStore';
import type { CalendarProviderError } from '../model/provider';

export function canReadGoogleCalendarCache(
  status: GoogleCalendarConnectionStatus,
): boolean {
  return status !== GoogleCalendarConnectionStatus.Disconnected;
}

export function useGoogleCalendarConnection(): {
  status: GoogleCalendarConnectionStatus;
  connected: boolean;
  reauthRequired: boolean;
  ready: boolean;
  cachedEventsAvailable: boolean;
  error: CalendarProviderError | null;
  refresh: () => Promise<void>;
} {
  const snapshot = useSyncExternalStore(
    subscribeGoogleCalendarConnection,
    getGoogleCalendarConnection,
    getGoogleCalendarConnection,
  );
  return {
    status: snapshot.status,
    connected: snapshot.connected,
    reauthRequired: snapshot.reauthRequired,
    ready: snapshot.ready,
    cachedEventsAvailable: canReadGoogleCalendarCache(snapshot.status),
    error: snapshot.error,
    refresh: () => refreshGoogleCalendarConnection({ force: true }),
  };
}
