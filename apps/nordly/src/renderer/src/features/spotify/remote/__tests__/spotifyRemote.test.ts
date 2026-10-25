import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('@platform/runtime', () => ({ isNativeHttpInTauri: () => false }));
beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it('honours Retry-After across API calls and token refresh without another network request', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(new Response('Too many requests', { status: 429, headers: { 'Retry-After': '120' } })).mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetchMock);
  const { spotifySend, refreshAccessToken } = await import('../spotifyRemote');
  await expect(spotifySend('token', 'GET', '/me')).rejects.toMatchObject({ status: 429 });
  await expect(spotifySend('token', 'PUT', '/me/player/play')).rejects.toMatchObject({ status: 429 });
  await expect(refreshAccessToken('client', 'refresh')).rejects.toMatchObject({ status: 429 });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  vi.setSystemTime(Date.now() + 120_000);
  await expect(spotifySend('token', 'GET', '/me')).resolves.toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
