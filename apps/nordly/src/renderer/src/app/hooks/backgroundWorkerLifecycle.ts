import { BackgroundOperationError } from '../backgroundErrorPolicy';

export interface CloudWorkerDependencies {
  loadVaultPrefs: (userId: string) => Promise<unknown>;
  isCloudEnabled: () => boolean;
  isVaultEnabled: () => boolean;
  hydrateCalendarCache: () => Promise<void>;
  startWorkers: () => void;
  stopWorkers: () => void;
}

export interface InitializeCloudWorkersOptions {
  userId: string;
  isCancelled: () => boolean;
  setVaultGateActive: (active: boolean) => void;
  onVaultPrefsReady?: () => void;
  dependencies: CloudWorkerDependencies;
}

/** Vault prefs + calendar cache only — sync workers are started separately. */
export async function initializeCloudWorkers({
  userId,
  isCancelled,
  setVaultGateActive,
  onVaultPrefsReady,
  dependencies,
}: InitializeCloudWorkersOptions): Promise<void> {
  try {
    await dependencies.loadVaultPrefs(userId);
  } catch (err) {
    if (!isCancelled()) {
      setVaultGateActive(false);
      onVaultPrefsReady?.();
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new BackgroundOperationError(
      'vault',
      `vault prefs load failed: ${message}`,
      err,
    );
  }
  if (isCancelled()) return;

  setVaultGateActive(dependencies.isVaultEnabled());
  onVaultPrefsReady?.();
  if (!dependencies.isCloudEnabled()) return;

  await dependencies.hydrateCalendarCache();
}
