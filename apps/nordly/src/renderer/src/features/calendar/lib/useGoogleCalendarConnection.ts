import { useCallback, useEffect, useState } from 'react';

import { getTrackerSettings } from '@features/calendar/api/calendarClient';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { useSyncStore } from '@shared/model/sync';
import { isCloudApiAvailable, isCloudEnabled } from '@shared/sync/syncConfig';

let settingsCache: {
  connected: boolean;
  reauthRequired: boolean;
  fetchedAt: number;
} | null = null;

const SETTINGS_TTL_MS = 30_000;

function isAuthError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /\b401\b|unauthorized|missing access token/i.test(message);
}

function markDisconnected(): void {
  settingsCache = {
    connected: false,
    reauthRequired: false,
    fetchedAt: Date.now(),
  };
}

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
    // Local / tokenless profiles keep Google Calendar idle — never call tracker APIs.
    if (!isCloudEnabled() || !isCloudApiAvailable()) {
      markDisconnected();
      setConnected(false);
      setReauthRequired(false);
      setReady(true);
      setError(null);
      return;
    }
    let s: Awaited<ReturnType<typeof getTrackerSettings>>;
    try {
      s = await getTrackerSettings();
    } catch (err) {
      if (isAuthError(err)) {
        useSyncStore.getState().setSessionReauthRequired(true);
        markDisconnected();
        setConnected(false);
        setReauthRequired(false);
        setReady(true);
        setError(null);
        return;
      }
      throw err;
    }
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

  if (error && !useSyncStore.getState().sessionReauthRequired) throw error;

  return { connected, reauthRequired, ready, refresh };
}
