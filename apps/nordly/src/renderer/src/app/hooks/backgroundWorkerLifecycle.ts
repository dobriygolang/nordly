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
  dependencies: CloudWorkerDependencies;
}

/** Vault prefs + calendar cache only — sync workers are started separately. */
export async function initializeCloudWorkers({
  userId,
  isCancelled,
  setVaultGateActive,
  dependencies,
}: InitializeCloudWorkersOptions): Promise<void> {
  await dependencies.loadVaultPrefs(userId);
  if (isCancelled()) return;

  setVaultGateActive(dependencies.isVaultEnabled());
  if (!dependencies.isCloudEnabled()) return;

  await dependencies.hydrateCalendarCache();
}
