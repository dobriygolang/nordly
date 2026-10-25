import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('@platform/runtime', () => ({ isNativeHttpInTauri: () => false }));
beforeEach(() => { localStorage.clear(); vi.resetModules(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const tokens = () => new Response(JSON.stringify({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600 }));

it('honours library Retry-After without blocking token exchange or refresh', async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response('Too many requests', { status: 429, headers: { 'Retry-After': '120' } }))
    .mockResolvedValueOnce(tokens()).mockResolvedValueOnce(tokens())
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetchMock);
  const { spotifyLibrarySend, exchangeAuthorizationCode, refreshAccessToken } = await import('../spotifyRemote');
  await expect(spotifyLibrarySend('token', 'GET', '/me/library/contains?uris=spotify%3Atrack%3Aid')).rejects.toMatchObject({ status: 429 });
  await expect(spotifyLibrarySend('token', 'PUT', '/me/library?uris=spotify%3Atrack%3Aid')).rejects.toMatchObject({ status: 429 });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await expect(exchangeAuthorizationCode('client', 'code', 'verifier')).resolves.toMatchObject({ accessToken: 'access' });
  await expect(refreshAccessToken('client', 'refresh')).resolves.toMatchObject({ accessToken: 'access' });
  expect(fetchMock).toHaveBeenCalledTimes(3);
  vi.setSystemTime(Date.now() + 120_000);
  await expect(spotifyLibrarySend('token', 'GET', '/me/library/contains?uris=spotify%3Atrack%3Aid')).resolves.toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(4);
});

it('honours an actual accounts rate limit without blocking library actions with a valid token', async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response('Too many requests', { status: 429, headers: { 'Retry-After': '90' } }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(tokens());
  vi.stubGlobal('fetch', fetchMock);
  const { spotifyLibrarySend, exchangeAuthorizationCode, refreshAccessToken, spotifyAuthRetryAt } = await import('../spotifyRemote');
  await expect(exchangeAuthorizationCode('client', 'code', 'verifier')).rejects.toMatchObject({ status: 429, retryAt: Date.now() + 90_000 });
  await expect(refreshAccessToken('client', 'refresh')).rejects.toMatchObject({ status: 429 });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(spotifyAuthRetryAt()).toBe(Date.now() + 90_000);
  await expect(spotifyLibrarySend('token', 'PUT', '/me/library?uris=spotify%3Atrack%3Aid')).resolves.toBeNull();
  vi.setSystemTime(Date.now() + 90_000);
  await expect(exchangeAuthorizationCode('client', 'code', 'verifier')).resolves.toMatchObject({ accessToken: 'access' });
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

it('preserves developer quota metadata during the pause instead of mislabelling it as sign-in failure', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ error: { status: 429, message: 'Too many requests', reason: 'QUOTA_EXCEEDED' } }), { status: 429, headers: { 'Retry-After': '3600' } })));
  const { spotifyLibrarySend } = await import('../spotifyRemote');
  await expect(spotifyLibrarySend('token', 'GET', '/me/library/contains?uris=spotify%3Atrack%3Aid')).rejects.toMatchObject({ status: 429, reason: 'QUOTA_EXCEEDED' });
  await expect(spotifyLibrarySend('token', 'GET', '/me/library/contains?uris=spotify%3Atrack%3Aid')).rejects.toMatchObject({ status: 429, reason: 'QUOTA_EXCEEDED' });
});

it('blocks all new network requests at the transport boundary while disabled', async () => {
  const { patchSettings } = await import('@shared/model/settings');
  patchSettings({ spotifyEnabled: false });
  const network = vi.fn();
  vi.stubGlobal('fetch', network);
  const { spotifyLibrarySend, exchangeAuthorizationCode, refreshAccessToken } = await import('../spotifyRemote');
  await expect(spotifyLibrarySend('token', 'PUT', '/me/library?uris=spotify%3Atrack%3Aid')).rejects.toThrow('disabled');
  await expect(exchangeAuthorizationCode('client', 'code', 'verifier')).rejects.toThrow('disabled');
  await expect(refreshAccessToken('client', 'refresh')).rejects.toThrow('disabled');
  expect(network).not.toHaveBeenCalled();
});

it('does not reset Spotify backoff when the integration is toggled off and on', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(new Response('Too many requests', { status: 429, headers: { 'Retry-After': '120' } }));
  vi.stubGlobal('fetch', fetchMock);
  const { spotifyLibrarySend } = await import('../spotifyRemote');
  const { patchSettings } = await import('@shared/model/settings');
  await expect(spotifyLibrarySend('token', 'GET', '/me/library/contains?uris=spotify%3Atrack%3Aid')).rejects.toMatchObject({ status: 429 });
  patchSettings({ spotifyEnabled: false });
  patchSettings({ spotifyEnabled: true });
  await expect(spotifyLibrarySend('token', 'GET', '/me/library/contains?uris=spotify%3Atrack%3Aid')).rejects.toMatchObject({ status: 429 });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('does not probe an exhausted developer quota every polling interval when Spotify gives no reset time', async () => {
  const network = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ error: { reason: 'QUOTA_EXCEEDED' } }), { status: 429 }));
  vi.stubGlobal('fetch', network);
  const { spotifyLibrarySend } = await import('../spotifyRemote');
  await expect(spotifyLibrarySend('token', 'GET', '/me/library/contains?uris=spotify%3Atrack%3Aid')).rejects.toMatchObject({ reason: 'QUOTA_EXCEEDED', retryAt: Date.now() + 15 * 60_000 });
  vi.setSystemTime(Date.now() + 60_000);
  await expect(spotifyLibrarySend('token', 'GET', '/me/library/contains?uris=spotify%3Atrack%3Aid')).rejects.toMatchObject({ status: 429 });
  expect(network).toHaveBeenCalledTimes(1);
});

it('rejects cloud playback paths so local controls cannot silently use the Web API', async () => {
  const network = vi.fn();
  vi.stubGlobal('fetch', network);
  const { spotifyLibrarySend } = await import('../spotifyRemote');
  await expect(spotifyLibrarySend('token', 'PUT', '/me/player/play')).rejects.toThrow('Only explicit Spotify library actions');
  expect(network).not.toHaveBeenCalled();
});
