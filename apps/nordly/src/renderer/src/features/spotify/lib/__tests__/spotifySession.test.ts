import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('@platform/runtime', () => ({ isTauriRuntime: () => true }));
vi.mock('@tauri-apps/api/event', () => ({ emit: vi.fn(), listen: vi.fn(async () => vi.fn()) }));
vi.mock('../pkce', () => ({ spotifyClientId: () => 'client-id', createPkce: vi.fn(), spotifyAuthorizeUrl: vi.fn() }));
vi.mock('../secret', () => ({
  loadSpotifySecret: vi.fn(async () => ({ accessToken: 'token', refreshToken: 'refresh', expiresAt: Date.now() + 3600_000 })),
  saveSpotifySecret: vi.fn(), clearSpotifySecret: vi.fn(), emptySecret: vi.fn(),
}));
vi.mock('../../remote/spotifyRemote', async (original) => ({
  ...await original<typeof import('../../remote/spotifyRemote')>(),
  spotifyLibrarySend: vi.fn(), exchangeAuthorizationCode: vi.fn(), refreshAccessToken: vi.fn(),
}));
import { spotifyLibrarySend, SpotifyHttpError, exchangeAuthorizationCode } from '../../remote/spotifyRemote';
import { patchSpotify, useSpotifyStore } from '../spotifyStore';
import { acceptSpotifyRedirect, connectSpotify, disconnectSpotify, toggleSpotifyLike } from '../spotifySession';
import { loadSpotifySecret, clearSpotifySecret } from '../secret';
import { readSettings } from '@shared/model/settings';
import type { NordlyAPI } from '@platform/ipc';

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  window.nordly = { spotify: { load: vi.fn(), save: vi.fn(), clear: vi.fn() } } as unknown as NordlyAPI;
  patchSpotify({ enabled: true, connected: true, libraryConnected: true, reauthRequired: false, localStatus: 'ready', connectError: null,
    nowPlaying: { connected: true, playback: { kind: 'track', trackId: 'id', title: 'Song', artist: 'Artist' }, canLike: true, liked: false, likeError: '' } });
});

it('uses the cloud library only after a heart click', async () => {
  vi.mocked(spotifyLibrarySend).mockResolvedValueOnce([true]).mockResolvedValueOnce(null);
  await toggleSpotifyLike();
  expect(spotifyLibrarySend).toHaveBeenNthCalledWith(1, 'token', 'GET', '/me/library/contains?uris=spotify%3Atrack%3Aid');
  expect(spotifyLibrarySend).toHaveBeenNthCalledWith(2, 'token', 'DELETE', '/me/library?uris=spotify%3Atrack%3Aid');
  expect(useSpotifyStore.getState().nowPlaying.liked).toBe(false);
});

it('keeps local music usable when the library quota is exhausted', async () => {
  vi.mocked(spotifyLibrarySend).mockRejectedValueOnce(new SpotifyHttpError(429, 'Too many requests', Date.now() + 60000, 'QUOTA_EXCEEDED'));
  await toggleSpotifyLike();
  expect(useSpotifyStore.getState().nowPlaying.playback).toMatchObject({ kind: 'track', title: 'Song' });
  expect(useSpotifyStore.getState().nowPlaying.likeError).not.toBe('');
  expect(useSpotifyStore.getState().connected).toBe(true);
});

it('does not read credentials for a heart unless the library is enabled', async () => {
  patchSpotify({ libraryConnected: false });
  await toggleSpotifyLike();
  expect(loadSpotifySecret).not.toHaveBeenCalled();
  expect(spotifyLibrarySend).not.toHaveBeenCalled();
});

it('can reuse saved credentials after explicitly enabling Liked Songs', async () => {
  patchSpotify({ libraryConnected: false });
  await connectSpotify();
  expect(useSpotifyStore.getState().libraryConnected).toBe(true);
  expect(readSettings().spotifyLikedSongs).toBe(true);
  expect(spotifyLibrarySend).not.toHaveBeenCalled();
});

it('disconnects only the optional library and leaves the local player intact', async () => {
  await disconnectSpotify();
  expect(clearSpotifySecret).toHaveBeenCalledTimes(1);
  expect(useSpotifyStore.getState()).toMatchObject({ connected: true, libraryConnected: false, localStatus: 'ready' });
  expect(useSpotifyStore.getState().nowPlaying.playback).toMatchObject({ kind: 'track', title: 'Song' });
});

it('does not label a temporary accounts rate limit as an invalid session', async () => {
  vi.mocked(loadSpotifySecret).mockResolvedValueOnce({ accessToken: '', refreshToken: '', expiresAt: 0, codeVerifier: 'verifier', oauthState: 'state' });
  vi.mocked(exchangeAuthorizationCode).mockRejectedValueOnce(new SpotifyHttpError(429, 'Too many requests', Date.now() + 60000));
  await expect(acceptSpotifyRedirect('code', 'state')).rejects.toMatchObject({ status: 429 });
  expect(useSpotifyStore.getState().connectError).toMatchObject({ kind: 'rate_limit' });
  expect(useSpotifyStore.getState().reauthRequired).toBe(false);
});
