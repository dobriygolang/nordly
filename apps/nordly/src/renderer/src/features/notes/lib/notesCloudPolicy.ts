import { SyncDeferredError } from '@shared/sync/errors';

export const NOTES_FS_VAULT_CLOUD_UNAVAILABLE = 'filesystem_vault_cloud_unavailable' as const;

export const NotesCloudOperation = {
  SyncPush: 'sync_push',
  SyncPull: 'sync_pull',
  Publish: 'publish',
  PublishStatus: 'publish_status',
  UpdatePublished: 'update_published',
  Unpublish: 'unpublish',
} as const;
export type NotesCloudOperation =
  (typeof NotesCloudOperation)[keyof typeof NotesCloudOperation];

export type NotesCloudCapability =
  | { available: true; reason: null; message: null }
  | {
      available: false;
      reason: typeof NOTES_FS_VAULT_CLOUD_UNAVAILABLE;
      message: string;
    };

const FS_VAULT_CLOUD_MESSAGE =
  'Cloud sync and publishing are unavailable while the filesystem vault is active. ' +
  'Your vault files remain the source of truth until vault file sync is available.';

export class NotesCloudCapabilityError extends SyncDeferredError {
  readonly code = NOTES_FS_VAULT_CLOUD_UNAVAILABLE;
  readonly operation: NotesCloudOperation;

  constructor(operation: NotesCloudOperation) {
    super(FS_VAULT_CLOUD_MESSAGE);
    this.name = 'NotesCloudCapabilityError';
    this.operation = operation;
  }
}

export function notesCloudCapabilityForVaultBound(
  filesystemVaultBound: boolean,
): NotesCloudCapability {
  if (!filesystemVaultBound) {
    return { available: true, reason: null, message: null };
  }
  return {
    available: false,
    reason: NOTES_FS_VAULT_CLOUD_UNAVAILABLE,
    message: FS_VAULT_CLOUD_MESSAGE,
  };
}

export function requireNotesCloudCapability(
  operation: NotesCloudOperation,
  filesystemVaultBound: boolean,
): void {
  if (filesystemVaultBound) {
    throw new NotesCloudCapabilityError(operation);
  }
}
