import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@shared/model/features', () => ({
  isCloudEnabled: () => false,
}));

import { initVault, isVaultUnlocked, lockVault, unlockVault } from '@shared/crypto/vault';
import { setDbUserId } from '@shared/db/nordlyDb';
import { STORAGE_KEYS } from '@shared/lib/storage-keys';

import { useSessionStore } from '../session';

const USER_A = '33333333-3333-4333-8333-333333333333';
const USER_B = '44444444-4444-4444-8444-444444444444';
const STORAGE_KEY = 'nordly:dev-session:v1';
const originalBridge = window.nordly;

function installNativeBridge(session: unknown = null): void {
  Object.defineProperty(window, 'nordly', {
    configurable: true,
    value: {
      auth: {
        session: vi.fn(async () => session),
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
      authKind: null,
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

  it('never mirrors a native session into localStorage', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'legacy-token-data');
    await useSessionStore.getState().hydrate({
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
      authKind: 'cloud',
      userId: USER_A,
      accessToken: 'a',
      refreshToken: null,
      expiresAt: Date.now() + 60_000,
    });
    setDbUserId(USER_A);
    await initVault();
    await unlockVault('correct horse battery staple');
    expect(isVaultUnlocked()).toBe(true);

    await useSessionStore.getState().hydrate({
      userId: USER_B,
      accessToken: 'b',
      expiresAt: Date.now() + 60_000,
    });

    expect(isVaultUnlocked()).toBe(false);
  });

  it('bootstraps a local profile when keychain is empty', async () => {
    await useSessionStore.getState().bootstrap();
    const state = useSessionStore.getState();
    expect(state.status).toBe('signed_in');
    expect(state.authKind).toBe('local');
    expect(state.userId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(state.accessToken).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEYS.localProfileUserId)).toBe(state.userId);
  });

  it('reuses the stored local profile id across bootstrap', async () => {
    window.localStorage.setItem(STORAGE_KEYS.localProfileUserId, USER_A);
    await useSessionStore.getState().bootstrap();
    expect(useSessionStore.getState().userId).toBe(USER_A);
    expect(useSessionStore.getState().authKind).toBe('local');
  });

  it('sign-out returns to a fresh local profile instead of guest', async () => {
    await useSessionStore.getState().hydrate({
      userId: USER_A,
      accessToken: 'tok',
      refreshToken: 'ref',
      expiresAt: Date.now() + 60_000,
    });
    expect(useSessionStore.getState().authKind).toBe('cloud');

    await useSessionStore.getState().clear();
    const state = useSessionStore.getState();
    expect(state.status).toBe('signed_in');
    expect(state.authKind).toBe('local');
    expect(state.userId).not.toBe(USER_A);
    expect(state.userId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(state.accessToken).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEYS.localProfileUserId)).toBe(state.userId);
  });

  it('cloud login from a local profile does not rebind IndexedDB into the new account', async () => {
    window.localStorage.setItem(STORAGE_KEYS.localProfileUserId, USER_A);
    await useSessionStore.getState().bootstrap();
    expect(useSessionStore.getState().userId).toBe(USER_A);
    expect(useSessionStore.getState().authKind).toBe('local');

    await useSessionStore.getState().hydrate({
      userId: USER_B,
      accessToken: 'tok',
      refreshToken: 'ref',
      expiresAt: Date.now() + 60_000,
    });

    expect(useSessionStore.getState().userId).toBe(USER_B);
    expect(useSessionStore.getState().authKind).toBe('cloud');
    // Local profile pointer follows the cloud user for next sign-out rotation,
    // but rows under USER_A are left untouched (no rebind).
    expect(window.localStorage.getItem(STORAGE_KEYS.localProfileUserId)).toBe(USER_B);
  });
});
