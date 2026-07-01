import { getTrackerSettings } from '@features/calendar/api/calendarClient';
import { LOCAL_ONLY } from '@app/config/features';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { googleCalendarPollIntervalMs } from '@pages/Settings/lib/settings-store';
import { canReachNetwork, isSyncEnabled } from '@shared/sync/syncConfig';

import {
  defaultGoogleSyncWindow,
  GoogleReauthError,
  invalidateGoogleCalendarCache,
  isGoogleCalendarSnapshotFresh,
  syncGoogleCalendarSnapshot,
} from './googleCalendarCache';

let started = false;
let intervalId: number | null = null;
let running = false;

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

async function shouldSync(): Promise<boolean> {
  if (LOCAL_ONLY || !isSyncEnabled() || !canReachNetwork()) return false;
  try {
    const s = await getTrackerSettings();
    return s.googleCalendarConnected && !s.googleReauthRequired;
  } catch {
    return false;
  }
}

async function runCycle(force = false): Promise<void> {
  if (running) return;
  if (!force && isGoogleCalendarSnapshotFresh()) return;

  const ok = await shouldSync();
  if (!ok) return;

  running = true;
  try {
    const { timeMin, timeMax } = defaultGoogleSyncWindow();
    await syncGoogleCalendarSnapshot(timeMin, timeMax, { force });
    dispatchChanged();
  } catch (err) {
    if (err instanceof GoogleReauthError) {
      invalidateGoogleCalendarCache();
      dispatchChanged();
    }
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
  if (started || LOCAL_ONLY) return;
  started = true;

  void runCycle(false);

  scheduleInterval();

  window.addEventListener(NORDLY_EVENTS.googleCalendarOAuth, onOAuth);
  window.addEventListener(NORDLY_EVENTS.syncChanged, onSyncChanged);
  window.addEventListener(NORDLY_EVENTS.settingsChanged, onSettingsChanged);
  window.addEventListener('focus', onFocus);
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
  if (intervalId !== null) window.clearInterval(intervalId);
  intervalId = null;
  window.removeEventListener(NORDLY_EVENTS.googleCalendarOAuth, onOAuth);
  window.removeEventListener(NORDLY_EVENTS.syncChanged, onSyncChanged);
  window.removeEventListener(NORDLY_EVENTS.settingsChanged, onSettingsChanged);
  window.removeEventListener('focus', onFocus);
}
