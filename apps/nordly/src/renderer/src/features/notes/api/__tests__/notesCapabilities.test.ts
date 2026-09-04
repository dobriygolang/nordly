import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SyncDeferredError } from '@shared/sync/errors';

const vaultGetConfig = vi.hoisted(() => vi.fn());

vi.mock('@features/notes/vault/ipc', () => ({
  vaultGetConfig,
}));

import {
  assertNotesCloudCapability,
  getNotesCloudCapability,
  NOTES_FS_VAULT_CLOUD_UNAVAILABLE,
} from '../notesCapabilities';

describe('notes cloud capability', () => {
  beforeEach(() => {
    vaultGetConfig.mockReset();
  });

  it('allows the legacy IndexedDB notes path', async () => {
    vaultGetConfig.mockResolvedValue(null);

    await expect(getNotesCloudCapability()).resolves.toEqual({
      available: true,
      reason: null,
      message: null,
    });
  });

  it('blocks filesystem-vault cloud actions with a typed capability error', async () => {
    vaultGetConfig.mockResolvedValue({
      root: '/vault',
      attachmentFolder: 'img',
      migratedFromIdb: true,
    });

    const capability = await getNotesCloudCapability();
    expect(capability).toMatchObject({
      available: false,
      reason: NOTES_FS_VAULT_CLOUD_UNAVAILABLE,
    });
    await expect(assertNotesCloudCapability('publish')).rejects.toMatchObject({
      name: 'NotesCloudCapabilityError',
      code: NOTES_FS_VAULT_CLOUD_UNAVAILABLE,
      operation: 'publish',
    });
    await expect(assertNotesCloudCapability('sync_push')).rejects.toBeInstanceOf(
      SyncDeferredError,
    );
    expect(capability.message).not.toMatch(/sign in/i);
  });
});
