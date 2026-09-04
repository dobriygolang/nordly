import { getTrackerSettings, type TrackerSettings } from '@features/calendar/api/calendarClient';
import {
  CalendarProvider,
  CalendarProviderErrorKind,
  calendarProviderError,
  type CalendarProviderError,
} from '@features/calendar/model/provider';
import { isCloudEnabled } from '@shared/model/features';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { AuthKind, useSessionStore } from '@shared/model/session';

import { invalidateGoogleCalendarCache } from './googleCalendarCache';

export const GoogleCalendarConnectionStatus = {
  Unknown: 'unknown',
  Connected: 'connected',
  Disconnected: 'disconnected',
  Reauth: 'reauth',
  OfflineCached: 'offline-cached',
} as const;
export type GoogleCalendarConnectionStatus =
  (typeof GoogleCalendarConnectionStatus)[keyof typeof GoogleCalendarConnectionStatus];

export interface GoogleCalendarConnectionSnapshot {
  status: GoogleCalendarConnectionStatus;
  connected: boolean;
  reauthRequired: boolean;
  ready: boolean;
  fetchedAt: number;
  settings: TrackerSettings | null;
  error: CalendarProviderError | null;
}

const SETTINGS_TTL_MS = 30_000;

const DISCONNECTED: GoogleCalendarConnectionSnapshot = {
  status: GoogleCalendarConnectionStatus.Disconnected,
  connected: false,
  reauthRequired: false,
  ready: true,
  fetchedAt: 0,
  settings: null,
  error: null,
};

let snapshot: GoogleCalendarConnectionSnapshot = {
  status: GoogleCalendarConnectionStatus.Unknown,
  connected: false,
  reauthRequired: false,
  ready: false,
  fetchedAt: 0,
  settings: null,
  error: null,
};

const listeners = new Set<() => void>();
let started = false;
let inflight: Promise<void> | null = null;
let connectionGeneration = 0;

function notify(): void {
  for (const listener of listeners) listener();
}

function setSnapshot(next: GoogleCalendarConnectionSnapshot): void {
  const same =
    snapshot.status === next.status &&
    snapshot.connected === next.connected &&
    snapshot.reauthRequired === next.reauthRequired &&
    snapshot.ready === next.ready &&
    snapshot.fetchedAt === next.fetchedAt &&
    snapshot.settings === next.settings &&
    snapshot.error?.kind === next.error?.kind &&
    snapshot.error?.message === next.error?.message;
  if (same) return;
  snapshot = next;
  notify();
}

function markDisconnected(clearCache: boolean): void {
  const settings = snapshot.settings
    ? {
        ...snapshot.settings,
        googleCalendarConnected: false,
        googleReauthRequired: false,
      }
    : null;
  setSnapshot({
    ...DISCONNECTED,
    fetchedAt: Date.now(),
    settings,
  });
  if (clearCache) invalidateGoogleCalendarCache();
}

function cacheFresh(): boolean {
  return (
    snapshot.status !== GoogleCalendarConnectionStatus.Unknown &&
    snapshot.status !== GoogleCalendarConnectionStatus.OfflineCached &&
    Date.now() - snapshot.fetchedAt < SETTINGS_TTL_MS
  );
}

export function isGoogleCalendarConnectionFresh(): boolean {
  return cacheFresh();
}

export function getGoogleCalendarConnection(): GoogleCalendarConnectionSnapshot {
  return snapshot;
}

export function resetGoogleCalendarConnection(previousUserId?: string): void {
  connectionGeneration += 1;
  inflight = null;
  snapshot = {
    status: GoogleCalendarConnectionStatus.Unknown,
    connected: false,
    reauthRequired: false,
    ready: false,
    fetchedAt: 0,
    settings: null,
    error: null,
  };
  invalidateGoogleCalendarCache(previousUserId);
  notify();
}

export function googleConnectionFromTrackerSettings(
  settings: TrackerSettings,
  fetchedAt = Date.now(),
): GoogleCalendarConnectionSnapshot {
  const status = settings.googleReauthRequired
    ? GoogleCalendarConnectionStatus.Reauth
    : settings.googleCalendarConnected
      ? GoogleCalendarConnectionStatus.Connected
      : GoogleCalendarConnectionStatus.Disconnected;
  return {
    status,
    connected: settings.googleCalendarConnected,
    reauthRequired: settings.googleReauthRequired,
    ready: true,
    fetchedAt,
    settings,
    error: null,
  };
}

export function retainGoogleConnectionAfterRefreshError(
  current: GoogleCalendarConnectionSnapshot,
  error: unknown,
): GoogleCalendarConnectionSnapshot {
  const providerError = calendarProviderError(
    CalendarProvider.Google,
    CalendarProviderErrorKind.Fetch,
    error,
  );
  if (
    current.status === GoogleCalendarConnectionStatus.Connected ||
    current.status === GoogleCalendarConnectionStatus.OfflineCached
  ) {
    return {
      ...current,
      status: GoogleCalendarConnectionStatus.OfflineCached,
      connected: true,
      ready: true,
      error: providerError,
    };
  }
  return { ...current, error: providerError };
}

export function applyTrackerSettings(settings: TrackerSettings): void {
  const next = googleConnectionFromTrackerSettings(settings);
  setSnapshot(next);
  if (next.status === GoogleCalendarConnectionStatus.Disconnected) {
    invalidateGoogleCalendarCache();
  }
}

export function markGoogleCalendarReauthRequired(error?: unknown): void {
  const settings = snapshot.settings
    ? {
        ...snapshot.settings,
        googleCalendarConnected: true,
        googleReauthRequired: true,
      }
    : null;
  setSnapshot({
    status: GoogleCalendarConnectionStatus.Reauth,
    connected: true,
    reauthRequired: true,
    ready: true,
    fetchedAt: Date.now(),
    settings,
    error: calendarProviderError(
      CalendarProvider.Google,
      CalendarProviderErrorKind.Reauth,
      error ?? 'google_reauth_required',
    ),
  });
}

export function markGoogleCalendarDisconnected(): void {
  markDisconnected(true);
}

export async function refreshGoogleCalendarConnection(opts?: { force?: boolean }): Promise<void> {
  if (inflight) return inflight;
  if (!opts?.force && cacheFresh()) return;
  const generation = connectionGeneration;
  const request = (async () => {
    try {
      if (!isCloudEnabled()) {
        if (generation !== connectionGeneration) return;
        markDisconnected(false);
        return;
      }
      const settings = await getTrackerSettings();
      if (generation !== connectionGeneration) return;
      if (!settings) {
        if (useSessionStore.getState().authKind !== AuthKind.Cloud) {
          markDisconnected(false);
          return;
        }
        setSnapshot(
          retainGoogleConnectionAfterRefreshError(
            snapshot,
            new Error('Tracker settings are unavailable'),
          ),
        );
        return;
      }
      applyTrackerSettings(settings);
    } catch (err) {
      if (generation !== connectionGeneration) return;
      console.error('[nordly:calendar] google connection refresh failed', err);
      setSnapshot(retainGoogleConnectionAfterRefreshError(snapshot, err));
    }
  })();
  inflight = request;
  void request.then(
    () => {
      if (inflight === request) inflight = null;
    },
    () => {
      if (inflight === request) inflight = null;
    },
  );
  return request;
}

function ensureStarted(): void {
  if (started) return;
  started = true;
  window.addEventListener(NORDLY_EVENTS.googleCalendarOAuth, () => {
    void refreshGoogleCalendarConnection({ force: true });
  });
  if (!cacheFresh()) {
    void refreshGoogleCalendarConnection();
  }
}

export function subscribeGoogleCalendarConnection(listener: () => void): () => void {
  ensureStarted();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
