import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSessionStore } from '@shared/model/session';
import { useSyncStore } from '@shared/model/sync';

import {
  ensureAccessTokenForSync,
  refreshAccessToken,
  resetAuthRefreshState,
} from '../authSession';

describe('auth refresh gating', () => {
  beforeEach(() => {
    resetAuthRefreshState();
    useSyncStore.getState().setSessionReauthRequired(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('allows a valid access token after an earlier refresh rejection', async () => {
    useSessionStore.setState({
      status: 'signed_in',
      userId: '55555555-5555-4555-8555-555555555555',
      accessToken: 'expired',
      refreshToken: null,
      expiresAt: Date.now() - 1,
    });
    expect(await refreshAccessToken()).toBe(false);

    useSessionStore.setState({
      accessToken: 'fresh',
      refreshToken: null,
      expiresAt: Date.now() + 10 * 60_000,
    });

    expect(await ensureAccessTokenForSync()).toBe(true);
    expect(useSyncStore.getState().sessionReauthRequired).toBe(false);
  });

  it('retries refresh after a transient offline result', async () => {
    useSessionStore.setState({
      status: 'signed_in',
      userId: '66666666-6666-4666-8666-666666666666',
      accessToken: 'expired',
      refreshToken: 'refresh-1',
      expiresAt: Date.now() - 1,
    });
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    expect(await refreshAccessToken()).toBe(false);

    const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 600 }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            accessToken: `header.${payload}.signature`,
            refreshToken: 'refresh-2',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });

    expect(await refreshAccessToken()).toBe(true);
    expect(useSessionStore.getState().refreshToken).toBe('refresh-2');
  });
});
