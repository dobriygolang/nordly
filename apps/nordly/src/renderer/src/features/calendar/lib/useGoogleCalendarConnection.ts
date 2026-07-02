import { useCallback, useEffect, useState } from 'react';

import { getTrackerSettings } from '@features/calendar/api/calendarClient';
import { isCloudEnabled } from '@shared/model/features';
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
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!isCloudEnabled()) {
      setConnected(false);
      setReauthRequired(false);
      setReady(true);
      return;
    }
    const s = await getTrackerSettings();
    settingsCache = {
      connected: s.googleCalendarConnected,
      reauthRequired: s.googleReauthRequired,
      fetchedAt: Date.now(),
    };
    setConnected(s.googleCalendarConnected);
    setReauthRequired(s.googleReauthRequired);
    setReady(true);
    setError(null);
  }, []);

  useEffect(() => {
    void refresh().catch((err: unknown) => setError(err instanceof Error ? err : new Error(String(err))));
  }, [refresh]);

  useEffect(() => {
    if (!isCloudEnabled()) return;
    const onSync = () => void refresh().catch((err: unknown) => setError(err instanceof Error ? err : new Error(String(err))));
    window.addEventListener(NORDLY_EVENTS.syncChanged, onSync);
    return () => window.removeEventListener(NORDLY_EVENTS.syncChanged, onSync);
  }, [refresh]);

  if (error) throw error;

  return { connected, reauthRequired, ready, refresh };
}
