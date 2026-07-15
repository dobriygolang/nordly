import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@shared/model/features', () => ({
  isCloudEnabled: () => false,
}));

import { initVault, lockVault, unlockVault } from '@shared/crypto/vault';
import { setVaultEnabled } from '@shared/crypto/vaultPrefs';
import { dbGet, entityKey, setDbUserId } from '@shared/db/nordlyDb';
import { useSessionStore } from '@shared/model/session';

import { notesStoreUpsert, type StoredNote } from '../notesStore';

const USER_ID = '22222222-2222-4222-8222-222222222222';

describe('vault note writes', () => {
  beforeEach(async () => {
    lockVault();
    useSessionStore.setState({
      status: 'signed_in',
      userId: USER_ID,
      accessToken: 'test-access',
      refreshToken: null,
      expiresAt: Date.now() + 60_000,
    });
    setDbUserId(USER_ID);
    await initVault();
    await unlockVault('correct horse battery staple');
    await setVaultEnabled(true, USER_ID);
    lockVault();
  });

  it('rejects a plaintext write while an enabled vault is locked', async () => {
    await expect(notesStoreUpsert('locked-note', 'secret', 'plaintext')).rejects.toThrow(
      'plaintext note writes are disabled',
    );
    expect(
      await dbGet<StoredNote>('notes', entityKey('locked-note', USER_ID)),
    ).toBeNull();
  });
});
