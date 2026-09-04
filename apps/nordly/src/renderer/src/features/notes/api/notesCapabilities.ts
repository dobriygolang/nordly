import {
  NotesCloudCapabilityError,
  NotesCloudOperation,
  notesCloudCapabilityForVaultBound,
  requireNotesCloudCapability as requireCapabilityForVaultBound,
  type NotesCloudCapability,
} from '@features/notes/lib/notesCloudPolicy';
import { vaultGetConfig } from '@features/notes/vault/ipc';

export {
  NOTES_FS_VAULT_CLOUD_UNAVAILABLE,
  NotesCloudCapabilityError,
  NotesCloudOperation,
  notesCloudCapabilityForVaultBound,
} from '@features/notes/lib/notesCloudPolicy';
export type {
  NotesCloudCapability,
} from '@features/notes/lib/notesCloudPolicy';

/** Public policy probe for app sync wiring and user-initiated cloud actions. */
export async function getNotesCloudCapability(): Promise<NotesCloudCapability> {
  const config = await vaultGetConfig();
  return notesCloudCapabilityForVaultBound(Boolean(config?.root.trim()));
}

export async function assertNotesCloudCapability(
  operation: NotesCloudOperation,
): Promise<void> {
  const config = await vaultGetConfig();
  requireCapabilityForVaultBound(operation, Boolean(config?.root.trim()));
}

export function isNotesCloudCapabilityError(
  error: unknown,
): error is NotesCloudCapabilityError {
  return error instanceof NotesCloudCapabilityError;
}
