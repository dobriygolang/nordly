import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@shared/model/features', () => ({
  isCloudEnabled: () => false,
}));

import { initVault, isVaultUnlocked, lockVault, unlockVault } from '@shared/crypto/vault';
import { setDbUserId } from '@shared/db/nordlyDb';

import { useSessionStore } from '../session';

const USER_A = '33333333-3333-4333-8333-333333333333';
const USER_B = '44444444-4444-4444-8444-444444444444';
const STORAGE_KEY = 'nordly:dev-session:v1';
const originalBridge = window.nordly;

function installNativeBridge(): void {
  Object.defineProperty(window, 'nordly', {
    configurable: true,
    value: {
      auth: {
        session: vi.fn(async () => null),
        persist: vi.fn(async () => undefined),
        logout: vi.fn(async () => undefined),
        onChanged: vi.fn(() => () => undefined),
      },
    } as unknown as typeof window.nordly,
  });
}

describe('session security boundaries', () => {
  beforeEach(() => {
    window.localStorage.clear();
    installNativeBridge();
    lockVault();
    useSessionStore.setState({
      status: 'guest',
      userId: null,
      accessToken: null,
      refreshToken: null,
      expiresAt: 0,
    });
    setDbUserId(null);
  });

  afterEach(() => {
    Object.defineProperty(window, 'nordly', {
      configurable: true,
      value: originalBridge,
    });
  });

  it('never mirrors a native session into localStorage', () => {
    window.localStorage.setItem(STORAGE_KEY, 'legacy-token-data');
    useSessionStore.getState().hydrate({
      userId: USER_A,
      accessToken: 'native-access',
      refreshToken: 'native-refresh',
      expiresAt: Date.now() + 60_000,
    });

    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('locks the previous users vault before switching users', async () => {
    useSessionStore.setState({
      status: 'signed_in',
      userId: USER_A,
      accessToken: 'a',
      refreshToken: null,
      expiresAt: Date.now() + 60_000,
    });
    setDbUserId(USER_A);
    await initVault();
    await unlockVault('correct horse battery staple');
    expect(isVaultUnlocked()).toBe(true);

    useSessionStore.getState().hydrate({
      userId: USER_B,
      accessToken: 'b',
      expiresAt: Date.now() + 60_000,
    });

    expect(isVaultUnlocked()).toBe(false);
  });
});
