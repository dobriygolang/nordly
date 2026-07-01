import { useCallback, useEffect, useState } from 'react';

import { getTrackerSettings } from '@features/calendar/api/calendarClient';
import { LOCAL_ONLY } from '@app/config/features';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';

let settingsCache: {
  connected: boolean;
  reauthRequired: boolean;
  fetchedAt: number;
} | null = null;

const SETTINGS_TTL_MS = 30_000;

export function useGoogleCalendarConnection(): {
  connected: boolean;
  reauthRequired: boolean;
  ready: boolean;
  refresh: () => Promise<void>;
} {
  const [connected, setConnected] = useState(
    () => settingsCache?.connected ?? false,
  );
  const [reauthRequired, setReauthRequired] = useState(
    () => settingsCache?.reauthRequired ?? false,
  );
  const [ready, setReady] = useState(
    () => Boolean(settingsCache && Date.now() - settingsCache.fetchedAt < SETTINGS_TTL_MS),
  );

  const refresh = useCallback(async () => {
    if (LOCAL_ONLY) {
      setConnected(false);
      setReauthRequired(false);
      setReady(true);
      return;
    }
    try {
      const s = await getTrackerSettings();
      settingsCache = {
        connected: s.googleCalendarConnected,
        reauthRequired: s.googleReauthRequired,
        fetchedAt: Date.now(),
      };
      setConnected(s.googleCalendarConnected);
      setReauthRequired(s.googleReauthRequired);
    } catch {
      /* keep prior */
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (LOCAL_ONLY) return;
    const onSync = () => void refresh();
    window.addEventListener(NORDLY_EVENTS.syncChanged, onSync);
    return () => window.removeEventListener(NORDLY_EVENTS.syncChanged, onSync);
  }, [refresh]);

  return { connected, reauthRequired, ready, refresh };
}
