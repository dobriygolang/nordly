import { isVaultUnlocked } from '@shared/crypto/vault';
import { isVaultEnabledSync } from '@shared/crypto/vaultPrefs';

/** Publish/share requires vault unlocked when E2EE is enabled. */
export function isVaultReadyForPublish(): boolean {
  return !isVaultEnabledSync() || isVaultUnlocked();
}
