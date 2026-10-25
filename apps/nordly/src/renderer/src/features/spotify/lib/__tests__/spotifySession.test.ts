import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@platform/runtime', () => ({ isTauriRuntime: () => false }));
vi.mock('../secret', () => ({
  loadSpotifySecret: vi.fn(async () => ({ accessToken: 'test-token', refreshToken: '', expiresAt: Date.now() + 3600_000 })),
  saveSpotifySecret: vi.fn(), clearSpotifySecret: vi.fn(), emptySecret: vi.fn(),
}));
vi.mock('../../remote/spotifyRemote', async (original) => ({
  ...await original<typeof import('../../remote/spotifyRemote')>(),
  spotifySend: vi.fn(),
}));
import { spotifySend, SpotifyHttpError } from '../../remote/spotifyRemote';
import { patchSpotify, useSpotifyStore } from '../spotifyStore';
import { disconnectedNowPlaying } from '../nowPlaying';
import { refreshSpotifyPlayback, toggleSpotifyPlayback } from '../spotifySession';

const track = { is_playing: true, item: { type: 'track', id: 'id', name: 'Song', artists: [{ name: 'Artist' }] } };
beforeEach(() => {
  vi.mocked(spotifySend).mockReset();
  patchSpotify({ connected: true, nowPlaying: disconnectedNowPlaying() });
});
describe('Spotify playback', () => {
  it('keeps the current track when access to the library fails', async () => {
    vi.mocked(spotifySend).mockResolvedValueOnce(track).mockRejectedValueOnce(new SpotifyHttpError(403, 'Forbidden'));
    await refreshSpotifyPlayback();
    expect(useSpotifyStore.getState().nowPlaying.playback).toMatchObject({ kind: 'track', title: 'Song', isPlaying: true });
    expect(useSpotifyStore.getState().nowPlaying.likeError).not.toBe('');
    expect(spotifySend).toHaveBeenLastCalledWith('test-token', 'GET', '/me/library/contains?uris=spotify%3Atrack%3Aid');
  });
  it.each([true, false])('sends a real player command when playing=%s', async (playing) => {
    vi.mocked(spotifySend).mockResolvedValueOnce({ is_playing: playing }).mockResolvedValueOnce(null).mockResolvedValueOnce(track).mockResolvedValueOnce([true]);
    await toggleSpotifyPlayback();
    expect(spotifySend).toHaveBeenNthCalledWith(2, 'test-token', 'PUT', playing ? '/me/player/pause' : '/me/player/play');
  });
  it('explains that an active Spotify device is required', async () => {
    vi.mocked(spotifySend).mockResolvedValueOnce(null).mockRejectedValueOnce(new SpotifyHttpError(404, 'No active device'));
    await toggleSpotifyPlayback();
    expect(useSpotifyStore.getState().nowPlaying.playback).toMatchObject({ kind: 'error' });
    expect(JSON.stringify(useSpotifyStore.getState().nowPlaying)).not.toContain('No active device');
  });
});
