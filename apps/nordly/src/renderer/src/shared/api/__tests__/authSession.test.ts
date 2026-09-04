import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@shared/model/features', () => ({
  isCloudEnabled: vi.fn(() => true),
}));

import { useSessionStore } from '@shared/model/session';
import { useSyncStore } from '@shared/model/sync';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';

import {
  ensureAccessTokenForSync,
  ensureCloudAuth,
  handleUnauthorized,
  refreshAccessToken,
  rejectPendingCloudAuth,
  resetAuthRefreshState,
} from '../authSession';

const CLOUD_USER = '55555555-5555-4555-8555-555555555555';

function setCloudSession(partial: {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number;
  userId?: string;
}): void {
  useSessionStore.setState({
    status: 'signed_in',
    authKind: 'cloud',
    userId: partial.userId ?? CLOUD_USER,
    accessToken: partial.accessToken,
    refreshToken: partial.refreshToken,
    expiresAt: partial.expiresAt,
  });
}

describe('auth refresh gating', () => {
  beforeEach(() => {
    resetAuthRefreshState();
    rejectPendingCloudAuth();
    useSyncStore.getState().setSessionReauthRequired(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('allows a valid access token after an earlier refresh rejection', async () => {
    setCloudSession({
      accessToken: 'expired',
      refreshToken: null,
      expiresAt: Date.now() - 1,
    });
    expect(await refreshAccessToken()).toBe(false);
    expect(useSyncStore.getState().sessionReauthRequired).toBe(true);

    useSessionStore.setState({
      accessToken: 'fresh',
      refreshToken: null,
      expiresAt: Date.now() + 10 * 60_000,
    });

    expect(await ensureAccessTokenForSync()).toBe(true);
    expect(useSyncStore.getState().sessionReauthRequired).toBe(false);
  });

  it('does not demand reauth when offline with an expired access token', async () => {
    setCloudSession({
      accessToken: 'expired',
      refreshToken: 'refresh-1',
      expiresAt: Date.now() - 1,
      userId: '66666666-6666-4666-8666-666666666666',
    });
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });

    expect(await refreshAccessToken()).toBe(false);
    expect(useSyncStore.getState().sessionReauthRequired).toBe(false);

    await handleUnauthorized();
    expect(useSyncStore.getState().sessionReauthRequired).toBe(false);
  });

  it('retries refresh after a transient offline result', async () => {
    setCloudSession({
      accessToken: 'expired',
      refreshToken: 'refresh-1',
      expiresAt: Date.now() - 1,
      userId: '66666666-6666-4666-8666-666666666666',
    });
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    expect(await refreshAccessToken()).toBe(false);
    expect(useSyncStore.getState().sessionReauthRequired).toBe(false);

    const payload = btoa(
      JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 600 }),
    )
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
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
    expect(useSyncStore.getState().sessionReauthRequired).toBe(false);
  });

  it('does not demand reauth on transient online refresh failure', async () => {
    setCloudSession({
      accessToken: 'expired',
      refreshToken: 'refresh-1',
      expiresAt: Date.now() - 1,
      userId: '77777777-7777-4777-8777-777777777777',
    });
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    expect(await refreshAccessToken()).toBe(false);
    expect(useSyncStore.getState().sessionReauthRequired).toBe(false);
  });

  it('demands reauth only after definitive online refresh rejection', async () => {
    setCloudSession({
      accessToken: 'expired',
      refreshToken: 'refresh-1',
      expiresAt: Date.now() - 1,
      userId: '88888888-8888-4888-8888-888888888888',
    });
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 401, headers: { 'content-type': 'application/json' } })),
    );

    expect(await refreshAccessToken()).toBe(false);
    expect(useSyncStore.getState().sessionReauthRequired).toBe(true);
  });

  it('does not mark reauth for a tokenless local profile', async () => {
    useSessionStore.setState({
      status: 'signed_in',
      authKind: 'local',
      userId: '99999999-9999-4999-8999-999999999999',
      accessToken: null,
      refreshToken: null,
      expiresAt: 0,
    });
    expect(await refreshAccessToken()).toBe(false);
    expect(await ensureAccessTokenForSync()).toBe(false);
    expect(useSyncStore.getState().sessionReauthRequired).toBe(false);
  });

  it('ensureCloudAuth opens overlay for local profiles and resolves on reject', async () => {
    useSessionStore.setState({
      status: 'signed_in',
      authKind: 'local',
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      accessToken: null,
      refreshToken: null,
      expiresAt: 0,
    });
    const opened = vi.fn();
    window.addEventListener(NORDLY_EVENTS.openReauthLogin, opened);

    const pending = ensureCloudAuth();
    expect(opened).toHaveBeenCalledTimes(1);
    rejectPendingCloudAuth();
    expect(await pending).toBe(false);

    window.removeEventListener(NORDLY_EVENTS.openReauthLogin, opened);
  });

  it('ensureCloudAuth returns true for a valid cloud session without opening overlay', async () => {
    setCloudSession({
      accessToken: 'fresh',
      refreshToken: 'refresh-1',
      expiresAt: Date.now() + 60_000,
    });
    const opened = vi.fn();
    window.addEventListener(NORDLY_EVENTS.openReauthLogin, opened);
    expect(await ensureCloudAuth()).toBe(true);
    expect(opened).not.toHaveBeenCalled();
    window.removeEventListener(NORDLY_EVENTS.openReauthLogin, opened);
  });
});
