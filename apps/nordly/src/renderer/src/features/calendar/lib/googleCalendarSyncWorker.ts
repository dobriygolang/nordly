import { isCloudEnabled } from '@shared/model/features';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import type { IntegrationOAuthResult } from '@shared/lib/integrationOAuthMailbox';
import { googleCalendarPollIntervalMs } from '@shared/model/settings';
import { OAuthStatus } from '@shared/model/oauth';
import { canReachNetwork } from '@shared/lib/network';

import {
  defaultGoogleSyncWindow,
  GoogleNotConnectedError,
  GoogleReauthError,
  invalidateGoogleCalendarCache,
  isGoogleCalendarSnapshotFresh,
  reportGoogleCalendarError,
  syncGoogleCalendarSnapshot,
} from './googleCalendarCache';
import {
  getGoogleCalendarConnection,
  GoogleCalendarConnectionStatus,
  markGoogleCalendarDisconnected,
  markGoogleCalendarReauthRequired,
  refreshGoogleCalendarConnection,
} from './googleCalendarConnectionStore';

let started = false;
let intervalId: number | null = null;
let startupTimer: number | null = null;
let running = false;
const STARTUP_DEFER_MS = 5_000;

function pollIntervalMs(): number {
  return googleCalendarPollIntervalMs();
}

function scheduleInterval(): void {
  if (intervalId !== null) window.clearInterval(intervalId);
  if (!started) return;
  intervalId = window.setInterval(() => {
    if (document.hidden) return;
    void runCycle(false);
  }, pollIntervalMs());
}

function dispatchChanged(): void {
  window.dispatchEvent(new Event(NORDLY_EVENTS.googleCalendarChanged));
}

async function runCycle(force = false): Promise<void> {
  if (running) return;
  if (!force && document.hidden) return;
  if (!isCloudEnabled()) return;
  if (!force && isGoogleCalendarSnapshotFresh()) return;
  if (!canReachNetwork()) return;

  running = true;
  try {
    await refreshGoogleCalendarConnection();
    const connection = getGoogleCalendarConnection();
    if (connection.status !== GoogleCalendarConnectionStatus.Connected) return;

    const { timeMin, timeMax } = defaultGoogleSyncWindow();
    await syncGoogleCalendarSnapshot(timeMin, timeMax, { force });
    dispatchChanged();
  } catch (err) {
    if (err instanceof GoogleReauthError) {
      markGoogleCalendarReauthRequired(err);
      reportGoogleCalendarError(err);
      dispatchChanged();
      return;
    }
    if (err instanceof GoogleNotConnectedError) {
      markGoogleCalendarDisconnected();
      dispatchChanged();
      return;
    }
    reportGoogleCalendarError(err);
    dispatchChanged();
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
  window.addEventListener(
    NORDLY_EVENTS.googleCalendarRefreshRequested,
    onRefreshRequested,
  );
  window.addEventListener(NORDLY_EVENTS.syncChanged, onSyncChanged);
  window.addEventListener(NORDLY_EVENTS.settingsChanged, onSettingsChanged);
  window.addEventListener('focus', onFocus);
  document.addEventListener('visibilitychange', onVisible);

  startupTimer = window.setTimeout(() => {
    startupTimer = null;
    if (!started) return;
    void runCycle(false);
  }, STARTUP_DEFER_MS);
}

function onOAuth(e: Event): void {
  const detail = (e as CustomEvent<IntegrationOAuthResult>).detail;
  if (detail.status === OAuthStatus.Connected) {
    notifyGoogleCalendarConnected();
  }
}

function onSyncChanged(): void {
  void runCycle(false);
}

function onRefreshRequested(): void {
  invalidateGoogleCalendarCache();
  void runCycle(true);
}

function onFocus(): void {
  if (!isGoogleCalendarSnapshotFresh()) void runCycle(false);
}

function onVisible(): void {
  if (document.visibilityState === 'visible' && !isGoogleCalendarSnapshotFresh()) {
    void runCycle(false);
  }
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
  window.removeEventListener(
    NORDLY_EVENTS.googleCalendarRefreshRequested,
    onRefreshRequested,
  );
  window.removeEventListener(NORDLY_EVENTS.syncChanged, onSyncChanged);
  window.removeEventListener(NORDLY_EVENTS.settingsChanged, onSettingsChanged);
  window.removeEventListener('focus', onFocus);
  document.removeEventListener('visibilitychange', onVisible);
}
