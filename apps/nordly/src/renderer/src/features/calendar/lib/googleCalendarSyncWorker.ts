import { getTrackerSettings } from '@features/calendar/api/calendarClient';
import { ensureAccessTokenForSync } from '@shared/api/authSession';
import { isCloudEnabled } from '@shared/model/features';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { googleCalendarPollIntervalMs } from '@shared/model/settings';
import { canReachNetwork, isCloudApiAvailable, isSyncEnabled } from '@shared/sync/syncConfig';
import { useSyncStore } from '@shared/model/sync';

import {
  defaultGoogleSyncWindow,
  GoogleReauthError,
  invalidateGoogleCalendarCache,
  isGoogleCalendarSnapshotFresh,
  syncGoogleCalendarSnapshot,
} from './googleCalendarCache';

let started = false;
let intervalId: number | null = null;
let startupTimer: number | null = null;
let running = false;
const STARTUP_DEFER_MS = 5_000;

function isAuthError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /\b401\b|unauthorized/i.test(message);
}

function pollIntervalMs(): number {
  return googleCalendarPollIntervalMs();
}

function scheduleInterval(): void {
  if (intervalId !== null) window.clearInterval(intervalId);
  if (!started) return;
  intervalId = window.setInterval(() => {
    void runCycle(false);
  }, pollIntervalMs());
}

function dispatchChanged(): void {
  window.dispatchEvent(new Event(NORDLY_EVENTS.googleCalendarChanged));
}

async function runCycle(force = false): Promise<void> {
  if (running) return;
  if (!isCloudEnabled()) return;
  if (!force && isGoogleCalendarSnapshotFresh()) return;
  if (!isSyncEnabled() || !canReachNetwork()) return;
  if (!isCloudApiAvailable()) return;
  if (!(await ensureAccessTokenForSync())) return;

  running = true;
  try {
    const settings = await getTrackerSettings();
    if (!settings.googleCalendarConnected || settings.googleReauthRequired) return;

    const { timeMin, timeMax } = defaultGoogleSyncWindow();
    await syncGoogleCalendarSnapshot(timeMin, timeMax, { force });
    dispatchChanged();
  } catch (err) {
    if (err instanceof GoogleReauthError) {
      invalidateGoogleCalendarCache();
      dispatchChanged();
      return;
    }
    if (isAuthError(err)) {
      useSyncStore.getState().setSessionReauthRequired(true);
      return;
    }
    console.warn('[googleCalendarSync] unexpected error:', err);
  } finally {
    running = false;
  }
}

/** Internal: force-refresh snapshot (after writes / OAuth). */
export function refreshGoogleCalendarCache(): Promise<void> {
  return runCycle(true);
}

/** Call after OAuth connect or when Google settings change. */
export function notifyGoogleCalendarConnected(): void {
  invalidateGoogleCalendarCache();
  void runCycle(true);
}

export function startGoogleCalendarSyncWorker(): void {
  if (started || !isCloudEnabled()) return;
  started = true;

  scheduleInterval();

  window.addEventListener(NORDLY_EVENTS.googleCalendarOAuth, onOAuth);
  window.addEventListener(NORDLY_EVENTS.syncChanged, onSyncChanged);
  window.addEventListener(NORDLY_EVENTS.settingsChanged, onSettingsChanged);
  window.addEventListener('focus', onFocus);

  startupTimer = window.setTimeout(() => {
    startupTimer = null;
    if (!started) return;
    void runCycle(false);
  }, STARTUP_DEFER_MS);
}

function onOAuth(e: Event): void {
  const detail = (e as CustomEvent<{ status?: string }>).detail;
  if (detail?.status === 'connected') notifyGoogleCalendarConnected();
  if (detail?.status === 'disconnected') {
    invalidateGoogleCalendarCache();
    dispatchChanged();
  }
}

function onSyncChanged(): void {
  void runCycle(false);
}

function onFocus(): void {
  if (!isGoogleCalendarSnapshotFresh()) void runCycle(false);
}

function onSettingsChanged(): void {
  scheduleInterval();
}

export function stopGoogleCalendarSyncWorker(): void {
  if (!started) return;
  started = false;
  if (startupTimer !== null) window.clearTimeout(startupTimer);
  startupTimer = null;
  if (intervalId !== null) window.clearInterval(intervalId);
  intervalId = null;
  window.removeEventListener(NORDLY_EVENTS.googleCalendarOAuth, onOAuth);
  window.removeEventListener(NORDLY_EVENTS.syncChanged, onSyncChanged);
  window.removeEventListener(NORDLY_EVENTS.settingsChanged, onSettingsChanged);
  window.removeEventListener('focus', onFocus);
}
