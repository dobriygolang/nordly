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
  reauthRequired: boolean;
  isCancelled: () => boolean;
  setVaultGateActive: (active: boolean) => void;
  dependencies: CloudWorkerDependencies;
}

export async function initializeCloudWorkers({
  userId,
  reauthRequired,
  isCancelled,
  setVaultGateActive,
  dependencies,
}: InitializeCloudWorkersOptions): Promise<void> {
  await dependencies.loadVaultPrefs(userId);
  if (isCancelled()) return;

  setVaultGateActive(
    dependencies.isCloudEnabled() && dependencies.isVaultEnabled(),
  );
  if (reauthRequired) {
    dependencies.stopWorkers();
    return;
  }
  if (!dependencies.isCloudEnabled()) return;

  await dependencies.hydrateCalendarCache();
  if (isCancelled()) return;
  dependencies.startWorkers();
}
