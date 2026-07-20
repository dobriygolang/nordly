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

  // Vault + calendar hydrate once per signed-in user — do not remount on reauth flips.
  useEffect(() => {
    if (status !== 'signed_in' || !userId) {
      setVaultGateActive(false);
      cloudWorkerDependencies.stopWorkers();
      return;
    }

    let cancelled = false;
    void initializeCloudWorkers({
      userId,
      isCancelled: () => cancelled,
      setVaultGateActive,
      dependencies: cloudWorkerDependencies,
    }).catch(onError);

    return () => {
      cancelled = true;
      cloudWorkerDependencies.stopWorkers();
    };
  }, [status, userId, setVaultGateActive, onError]);

  // Pause cloud workers while interactive reauth is required; local app stays up.
  useEffect(() => {
    if (status !== 'signed_in' || !userId || !isCloudEnabled()) return;
    if (sessionReauthRequired) {
      cloudWorkerDependencies.stopWorkers();
      return;
    }
    cloudWorkerDependencies.startWorkers();
    return () => cloudWorkerDependencies.stopWorkers();
  }, [status, userId, sessionReauthRequired]);

  useEffect(() => {
    if (status !== 'signed_in') return;
    void import('@shared/api/device').then(async ({ ensureDevice }) => {
      const appVersion = await readAppVersion();
      void ensureDevice({ appVersion }).catch(onError);
    }, onError);
  }, [status, onError]);
}
