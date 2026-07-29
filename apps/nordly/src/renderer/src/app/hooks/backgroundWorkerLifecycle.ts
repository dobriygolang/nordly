export interface CloudWorkerDependencies {
  loadVaultPrefs: (userId: string) => Promise<unknown>;
  isCloudEnabled: () => boolean;
  /** Device-owned Google Calendar — independent of Nordly cloud / LOCAL_ONLY. */
  isGoogleIntegrationAvailable: () => boolean;
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

/** Vault prefs + optional calendar cache — sync workers are started separately. */
export async function initializeCloudWorkers({
  userId,
  isCancelled,
  setVaultGateActive,
  dependencies,
}: InitializeCloudWorkersOptions): Promise<void> {
  await dependencies.loadVaultPrefs(userId);
  if (isCancelled()) return;

  setVaultGateActive(dependencies.isVaultEnabled());
  if (!dependencies.isGoogleIntegrationAvailable()) return;

  await dependencies.hydrateCalendarCache();
}
