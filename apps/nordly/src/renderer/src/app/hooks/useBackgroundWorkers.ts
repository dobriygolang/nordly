import { useEffect } from 'react';

import { initPomodoroLeader } from '@features/focus/lib/pomodoroCrossWindow';
import {
  startGoogleCalendarSyncWorker,
  stopGoogleCalendarSyncWorker,
} from '@features/calendar/lib/googleCalendarSyncWorker';
import { hydrateGoogleCalendarCache } from '@features/calendar/lib/googleCalendarCache';
import {
  startCalendarReminderWorker,
  stopCalendarReminderWorker,
} from '@features/calendar/lib/calendarReminderWorker';
import {
  startTaskReminderWorker,
  stopTaskReminderWorker,
} from '@features/tasks/lib/taskReminderWorker';
import { startSessionRefreshLoop } from '@shared/api/authSession';
import { loadVaultPrefs, isVaultEnabledSync } from '@shared/crypto/vaultPrefs';
import { isCloudEnabled } from '@shared/model/features';
import { AuthStatus } from '@shared/model/session';
import { startSyncEngine, stopSyncEngine } from '@shared/sync/SyncEngine';
import {
  startUpdateCheckWorker,
  stopUpdateCheckWorker,
} from '@shared/lib/updateCheckWorker';
import { readAppVersion } from '@shared/lib/updater';
import { isTauriRuntime } from '@platform/runtime';
import {
  initializeCloudWorkers,
  type CloudWorkerDependencies,
} from './backgroundWorkerLifecycle';

const cloudWorkerDependencies: CloudWorkerDependencies = {
  loadVaultPrefs,
  isCloudEnabled,
  isVaultEnabled: isVaultEnabledSync,
  hydrateCalendarCache: hydrateGoogleCalendarCache,
  startWorkers: () => {
    startCalendarReminderWorker();
    startSyncEngine();
    startGoogleCalendarSyncWorker();
  },
  stopWorkers: () => {
    stopSyncEngine();
    stopGoogleCalendarSyncWorker();
    stopCalendarReminderWorker();
  },
};

interface UseBackgroundWorkersOptions {
  status: AuthStatus;
  userId: string | null;
  sessionReauthRequired: boolean;
  vaultPrefsReady: boolean;
  setVaultGateActive: (active: boolean) => void;
  setVaultPrefsReady: (ready: boolean) => void;
  onError: (error: unknown) => void;
}

export function useBackgroundWorkers({
  status,
  userId,
  sessionReauthRequired,
  vaultPrefsReady,
  setVaultGateActive,
  setVaultPrefsReady,
  onError,
}: UseBackgroundWorkersOptions): void {
  useEffect(() => initPomodoroLeader(), []);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    startUpdateCheckWorker();
    return () => stopUpdateCheckWorker();
  }, []);

  useEffect(() => {
    if (status !== AuthStatus.SignedIn) return;
    return startSessionRefreshLoop();
  }, [status]);

  useEffect(() => {
    if (status !== AuthStatus.SignedIn || !userId) {
      stopTaskReminderWorker();
      return;
    }
    startTaskReminderWorker();
    return () => stopTaskReminderWorker();
  }, [status, userId]);

  // Vault + calendar hydrate once per signed-in user — do not remount on reauth flips.
  useEffect(() => {
    if (status !== AuthStatus.SignedIn || !userId) {
      setVaultGateActive(false);
      setVaultPrefsReady(false);
      cloudWorkerDependencies.stopWorkers();
      return;
    }

    let cancelled = false;
    void initializeCloudWorkers({
      userId,
      isCancelled: () => cancelled,
      setVaultGateActive,
      onVaultPrefsReady: () => {
        if (!cancelled) setVaultPrefsReady(true);
      },
      dependencies: cloudWorkerDependencies,
    }).catch(onError);

    return () => {
      cancelled = true;
      setVaultPrefsReady(false);
      cloudWorkerDependencies.stopWorkers();
    };
  }, [status, userId, setVaultGateActive, setVaultPrefsReady, onError]);

  // Pause cloud workers while interactive reauth is required; local app stays up.
  // Do not start sync until vault prefs are loaded — isVaultEnabledSync() is false until then.
  useEffect(() => {
    if (
      status !== AuthStatus.SignedIn ||
      !userId ||
      !isCloudEnabled()
    ) {
      return;
    }
    if (!vaultPrefsReady) return;
    if (sessionReauthRequired) {
      cloudWorkerDependencies.stopWorkers();
      return;
    }
    cloudWorkerDependencies.startWorkers();
    return () => cloudWorkerDependencies.stopWorkers();
  }, [status, userId, sessionReauthRequired, vaultPrefsReady]);

  useEffect(() => {
    if (status !== AuthStatus.SignedIn) return;
    let cancelled = false;
    void (async () => {
      try {
        const { ensureDevice } = await import('@shared/api/device');
        if (cancelled) return;
        const appVersion = await readAppVersion();
        if (cancelled) return;
        await ensureDevice({ appVersion });
      } catch (error) {
        if (!cancelled) onError(error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, onError]);
}
