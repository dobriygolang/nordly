import { translate } from '@nordly-i18n';

import { notify } from '@shared/api/notifications';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { canReachNetwork } from '@shared/lib/network';
import { STORAGE_KEYS } from '@shared/lib/storage-keys';
import { readSettings } from '@shared/model/settings';

import {
  checkForUpdate,
  classifyUpdateError,
  compareSemver,
  fetchPublishedVersion,
  isTauriRuntime,
  readAppVersion,
  type UpdateCheckEventDetail,
} from './updater';

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const STARTUP_DEFER_MS = 30_000;
const ERROR_RETRY_MS = 5 * 60_000;

interface UpdateCheckState {
  lastCheckAt: number;
  lastNotifiedVersion: string | null;
}

let started = false;
let intervalId: number | null = null;
let startupTimer: number | null = null;
let checking = false;
let autoUpdateEnabled = false;
let checkAfterCurrent = false;
let retryAt = 0;
let workerEpoch = 0;

function readCheckState(): UpdateCheckState {
  if (typeof window === 'undefined') {
    return { lastCheckAt: 0, lastNotifiedVersion: null };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.updateCheck);
    if (!raw) return { lastCheckAt: 0, lastNotifiedVersion: null };
    const parsed = JSON.parse(raw) as Partial<UpdateCheckState>;
    if (parsed.lastCheckAt !== undefined && typeof parsed.lastCheckAt !== 'number') {
      throw new Error('Invalid update check state: lastCheckAt');
    }
    if (
      parsed.lastNotifiedVersion !== undefined &&
      parsed.lastNotifiedVersion !== null &&
      typeof parsed.lastNotifiedVersion !== 'string'
    ) {
      throw new Error('Invalid update check state: lastNotifiedVersion');
    }
    return {
      lastCheckAt: typeof parsed.lastCheckAt === 'number' ? parsed.lastCheckAt : 0,
      lastNotifiedVersion:
        typeof parsed.lastNotifiedVersion === 'string' ? parsed.lastNotifiedVersion : null,
    };
  } catch (err) {
    console.warn('[updateCheck] state read failed', err);
    return { lastCheckAt: 0, lastNotifiedVersion: null };
  }
}

function writeCheckState(state: UpdateCheckState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEYS.updateCheck, JSON.stringify(state));
  } catch (err) {
    console.warn('[updateCheck] state write failed', err);
  }
}

function dispatchUpdateAvailable(detail: UpdateCheckEventDetail): void {
  window.dispatchEvent(
    new CustomEvent(NORDLY_EVENTS.updateAvailable, {
      detail,
    }),
  );
}

function formatVersion(version: string): string {
  return version.startsWith('v') ? version : `v${version}`;
}

async function runCheck(force = false): Promise<void> {
  if (!started || checking || !isTauriRuntime()) return;
  if (!canReachNetwork()) return;

  const state = readCheckState();
  const now = Date.now();
  if (!force && (now < retryAt || now - state.lastCheckAt < CHECK_INTERVAL_MS)) return;

  checking = true;
  const epoch = workerEpoch;
  let failure: UpdateCheckEventDetail['error'];
  checkAfterCurrent = false;
  dispatchUpdateAvailable({ phase: 'checking' });
  try {
    const [installed, published] = await Promise.all([readAppVersion(), fetchPublishedVersion()]);
    if (!started || epoch !== workerEpoch) return;

    if (!published || compareSemver(published, installed) <= 0) {
      checkAfterCurrent = false;
      writeCheckState({ ...state, lastCheckAt: now });
      return;
    }

    dispatchUpdateAvailable({ published, installed });

    const settings = readSettings();
    if (settings.autoUpdate) {
      checkAfterCurrent = false;
      const result = await checkForUpdate(
        (phase) => {
          if (started && epoch === workerEpoch) dispatchUpdateAvailable({ published, installed, phase });
        },
        undefined,
        () => started && epoch === workerEpoch && readSettings().autoUpdate,
      );
      if (!started || epoch !== workerEpoch) return;
      if (result.kind === 'error') {
        failure = result;
        throw new Error(result.message);
      }
      if (result.kind === 'unavailable') throw new Error('Desktop updater is unavailable');
      writeCheckState({ ...state, lastCheckAt: now });
      retryAt = 0;
      return;
    }

    if (state.lastNotifiedVersion === published) {
      writeCheckState({ ...state, lastCheckAt: now });
      return;
    }

    await notify(
      translate('nordly.settings.update.notify_title'),
      translate('nordly.settings.update.notify_body', {
        published: formatVersion(published),
        version: formatVersion(installed),
      }),
    );
    if (started && epoch === workerEpoch) writeCheckState({ lastCheckAt: now, lastNotifiedVersion: published });
  } catch (err) {
    if (!started || epoch !== workerEpoch) return;
    // A failed installation is not a successful daily check. Retry on the next
    // focus/visibility check after a cooldown; explicit Off → On can retry now.
    retryAt = Date.now() + ERROR_RETRY_MS;
    writeCheckState({ ...state, lastCheckAt: 0 });
    const message = err instanceof Error ? err.message : String(err);
    dispatchUpdateAvailable({ error: failure ?? { kind: 'error', code: classifyUpdateError(message), message } });
    console.error('[nordly:update-check]', err);
  } finally {
    checking = false;
    if (started && epoch === workerEpoch) {
      dispatchUpdateAvailable({ phase: 'idle' });
    }
    if (started && checkAfterCurrent && readSettings().autoUpdate) void runCheck(true);
  }
}

function schedule(): void {
  if (intervalId !== null) window.clearInterval(intervalId);
  intervalId = window.setInterval(() => {
    if (document.hidden) return;
    void runCheck();
  }, CHECK_INTERVAL_MS);
}

function onFocus(): void {
  void runCheck();
}

function onSettingsChanged(): void {
  const next = readSettings().autoUpdate;
  if (next === autoUpdateEnabled) return;
  autoUpdateEnabled = next;
  checkAfterCurrent = next && checking;
  if (!next) return;
  if (startupTimer !== null) window.clearTimeout(startupTimer);
  startupTimer = null;
  void runCheck(true);
}

function onVisible(): void {
  if (document.visibilityState === 'visible') void runCheck();
}

export function startUpdateCheckWorker(): void {
  if (started || !isTauriRuntime()) return;
  started = true;
  workerEpoch += 1;
  autoUpdateEnabled = readSettings().autoUpdate;
  schedule();
  startupTimer = window.setTimeout(() => {
    startupTimer = null;
    if (!started) return;
    void runCheck(true);
  }, STARTUP_DEFER_MS);
  window.addEventListener('focus', onFocus);
  window.addEventListener(NORDLY_EVENTS.settingsChanged, onSettingsChanged);
  document.addEventListener('visibilitychange', onVisible);
}

export function stopUpdateCheckWorker(): void {
  if (!started) return;
  started = false;
  workerEpoch += 1;
  checkAfterCurrent = false;
  if (startupTimer !== null) window.clearTimeout(startupTimer);
  startupTimer = null;
  if (intervalId !== null) window.clearInterval(intervalId);
  intervalId = null;
  window.removeEventListener('focus', onFocus);
  window.removeEventListener(NORDLY_EVENTS.settingsChanged, onSettingsChanged);
  document.removeEventListener('visibilitychange', onVisible);
}
