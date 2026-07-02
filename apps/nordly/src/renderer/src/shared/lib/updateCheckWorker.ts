import { translate } from '@nordly-i18n';

import { notify } from '@shared/api/notifications';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { STORAGE_KEYS } from '@shared/lib/storage-keys';
import { readSettings } from '@shared/model/settings';

import {
  checkForUpdate,
  compareSemver,
  fetchPublishedVersion,
  isTauriRuntime,
  readAppVersion,
} from './updater';

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

interface UpdateCheckState {
  lastCheckAt: number;
  lastNotifiedVersion: string | null;
}

let started = false;
let intervalId: number | null = null;
let checking = false;

function readCheckState(): UpdateCheckState {
  if (typeof window === 'undefined') {
    return { lastCheckAt: 0, lastNotifiedVersion: null };
  }
  const raw = window.localStorage.getItem(STORAGE_KEYS.updateCheck);
  if (!raw) return { lastCheckAt: 0, lastNotifiedVersion: null };
  const parsed = JSON.parse(raw) as Partial<UpdateCheckState>;
  return {
    lastCheckAt: typeof parsed.lastCheckAt === 'number' ? parsed.lastCheckAt : 0,
    lastNotifiedVersion:
      typeof parsed.lastNotifiedVersion === 'string' ? parsed.lastNotifiedVersion : null,
  };
}

function writeCheckState(state: UpdateCheckState): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEYS.updateCheck, JSON.stringify(state));
}

function dispatchUpdateAvailable(published: string, installed: string): void {
  window.dispatchEvent(
    new CustomEvent(NORDLY_EVENTS.updateAvailable, {
      detail: { published, installed },
    }),
  );
}

function formatVersion(version: string): string {
  return version.startsWith('v') ? version : `v${version}`;
}

async function runCheck(force = false): Promise<void> {
  if (checking || !isTauriRuntime()) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  const state = readCheckState();
  const now = Date.now();
  if (!force && now - state.lastCheckAt < CHECK_INTERVAL_MS) return;

  checking = true;
  try {
    const [installed, published] = await Promise.all([readAppVersion(), fetchPublishedVersion()]);
    writeCheckState({ ...state, lastCheckAt: now });

    if (!published || compareSemver(published, installed) <= 0) return;

    dispatchUpdateAvailable(published, installed);

    const settings = readSettings();
    if (settings.autoUpdate) {
      await checkForUpdate(() => undefined);
      return;
    }

    if (state.lastNotifiedVersion === published) return;

    await notify(
      translate('nordly.settings.update.notify_title'),
      translate('nordly.settings.update.notify_body', {
        published: formatVersion(published),
        version: formatVersion(installed),
      }),
    );
    writeCheckState({ lastCheckAt: now, lastNotifiedVersion: published });
  } catch (err) {
    console.error('[nordly:update-check]', err);
  } finally {
    checking = false;
  }
}

function schedule(): void {
  if (intervalId !== null) window.clearInterval(intervalId);
  intervalId = window.setInterval(() => {
    void runCheck();
  }, CHECK_INTERVAL_MS);
}

function onFocus(): void {
  void runCheck();
}

export function startUpdateCheckWorker(): void {
  if (started || !isTauriRuntime()) return;
  started = true;
  schedule();
  void runCheck(true);
  window.addEventListener('focus', onFocus);
  window.addEventListener(NORDLY_EVENTS.settingsChanged, onFocus);
}

export function stopUpdateCheckWorker(): void {
  if (!started) return;
  started = false;
  if (intervalId !== null) window.clearInterval(intervalId);
  intervalId = null;
  window.removeEventListener('focus', onFocus);
  window.removeEventListener(NORDLY_EVENTS.settingsChanged, onFocus);
}
