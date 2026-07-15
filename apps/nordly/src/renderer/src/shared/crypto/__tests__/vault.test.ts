import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@shared/model/features', () => ({
  isCloudEnabled: () => false,
}));

import { setDbUserId } from '@shared/db/nordlyDb';
import { useSessionStore } from '@shared/model/session';

import { initVault, isVaultUnlocked, lockVault, unlockVault } from '../vault';

const USER_ID = '11111111-1111-4111-8111-111111111111';

describe('vault verifier', () => {
  beforeEach(() => {
    lockVault();
    useSessionStore.setState({
      status: 'signed_in',
      userId: USER_ID,
      accessToken: 'test-access',
      refreshToken: null,
      expiresAt: Date.now() + 60_000,
    });
    setDbUserId(USER_ID);
  });

  it('authenticates the passphrase before exposing the derived key', async () => {
    await initVault();
    await unlockVault('correct horse battery staple');
    expect(isVaultUnlocked()).toBe(true);

    lockVault();
    await expect(unlockVault('incorrect horse battery staple')).rejects.toThrow(
      'wrong passphrase or corrupted data',
    );
    expect(isVaultUnlocked()).toBe(false);

    await unlockVault('correct horse battery staple');
    expect(isVaultUnlocked()).toBe(true);
  });
});
