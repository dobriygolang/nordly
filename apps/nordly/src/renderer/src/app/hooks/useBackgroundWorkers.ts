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
import { isCloudEnabled, isGoogleIntegrationAvailable } from '@shared/model/features';
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

type AuthStatus = 'unknown' | 'guest' | 'signed_in';

const workerDependencies: CloudWorkerDependencies = {
  loadVaultPrefs,
  isCloudEnabled,
  isGoogleIntegrationAvailable,
  isVaultEnabled: isVaultEnabledSync,
  hydrateCalendarCache: hydrateGoogleCalendarCache,
  startWorkers: () => {
    /* sync-only — calendar workers start separately */
    startSyncEngine();
  },
  stopWorkers: () => {
    stopSyncEngine();
  },
};

function startDeviceCalendarWorkers(): void {
  startCalendarReminderWorker();
  startGoogleCalendarSyncWorker();
}

function stopDeviceCalendarWorkers(): void {
  stopGoogleCalendarSyncWorker();
  stopCalendarReminderWorker();
}

interface UseBackgroundWorkersOptions {
  status: AuthStatus;
  userId: string | null;
  sessionReauthRequired: boolean;
  setVaultGateActive: (active: boolean) => void;
  onError: (error: unknown) => void;
}

export function useBackgroundWorkers({
  status,
  userId,
  sessionReauthRequired,
  setVaultGateActive,
  onError,
}: UseBackgroundWorkersOptions): void {
  useEffect(() => initPomodoroLeader(), []);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    startUpdateCheckWorker();
    return () => stopUpdateCheckWorker();
  }, []);

  useEffect(() => {
    if (status !== 'signed_in') return;
    return startSessionRefreshLoop();
  }, [status]);

  useEffect(() => {
    if (status !== 'signed_in' || !userId) {
      stopTaskReminderWorker();
      return;
    }
    startTaskReminderWorker();
    return () => stopTaskReminderWorker();
  }, [status, userId]);

  // Vault + device Google Calendar hydrate once per signed-in user (incl. LOCAL_ONLY).
  useEffect(() => {
    if (status !== 'signed_in' || !userId) {
      setVaultGateActive(false);
      stopDeviceCalendarWorkers();
      workerDependencies.stopWorkers();
      return;
    }

    let cancelled = false;
    void initializeCloudWorkers({
      userId,
      isCancelled: () => cancelled,
      setVaultGateActive,
      dependencies: workerDependencies,
    })
      .then(() => {
        if (cancelled) return;
        startDeviceCalendarWorkers();
      })
      .catch(onError);

    return () => {
      cancelled = true;
      stopDeviceCalendarWorkers();
      workerDependencies.stopWorkers();
    };
  }, [status, userId, setVaultGateActive, onError]);

  // Nordly cloud sync only — independent of device Google/Zoom.
  useEffect(() => {
    if (status !== 'signed_in' || !userId || !isCloudEnabled()) return;
    if (sessionReauthRequired) {
      workerDependencies.stopWorkers();
      return;
    }
    workerDependencies.startWorkers();
    return () => workerDependencies.stopWorkers();
  }, [status, userId, sessionReauthRequired]);

  useEffect(() => {
    if (status !== 'signed_in') return;
    void import('@shared/api/device').then(async ({ ensureDevice }) => {
      const appVersion = await readAppVersion();
      void ensureDevice({ appVersion }).catch(onError);
    }, onError);
  }, [status, onError]);
}
