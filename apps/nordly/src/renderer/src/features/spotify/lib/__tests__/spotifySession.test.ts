import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@platform/runtime', () => ({ isTauriRuntime: () => false }));
vi.mock('../pkce', () => ({ spotifyClientId: () => 'client-id' }));
vi.mock('../secret', () => ({
  loadSpotifySecret: vi.fn(async () => ({ accessToken: 'test-token', refreshToken: '', expiresAt: Date.now() + 3600_000 })),
  saveSpotifySecret: vi.fn(), clearSpotifySecret: vi.fn(), emptySecret: vi.fn(),
}));
vi.mock('../../remote/spotifyRemote', async (original) => ({
  ...await original<typeof import('../../remote/spotifyRemote')>(),
  spotifySend: vi.fn(),
  exchangeAuthorizationCode: vi.fn(),
}));
import { spotifySend, SpotifyHttpError, exchangeAuthorizationCode } from '../../remote/spotifyRemote';
import { patchSpotify, useSpotifyStore } from '../spotifyStore';
import { disconnectedNowPlaying } from '../nowPlaying';
import { hydrateSpotify, acceptSpotifyRedirect, refreshSpotifyPlayback, setSpotifyPlayback, syncSpotifyWithTimer, watchSpotifyPlayback, queueSpotifyVolume, refreshSpotifyVolume, setSpotifyVolumeLock, setSpotifyEnabled } from '../spotifySession';
import { usePomodoroStore } from '@shared/model/pomodoro';
import { loadSpotifySecret, clearSpotifySecret } from '../secret';

const track = { is_playing: true, item: { type: 'track', id: 'id', name: 'Song', artists: [{ name: 'Artist' }] } };
let clock = Date.now();
beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(clock += 60_000);
  vi.mocked(spotifySend).mockReset();
  vi.mocked(loadSpotifySecret).mockClear();
  patchSpotify({ enabled: true, connected: true, hydrated: false, nowPlaying: disconnectedNowPlaying() });
});
afterEach(() => vi.useRealTimers());
describe('Spotify playback', () => {
  it('keeps the current track when access to the library fails', async () => {
    vi.mocked(spotifySend).mockResolvedValueOnce(track).mockRejectedValueOnce(new SpotifyHttpError(403, 'Forbidden'));
    await refreshSpotifyPlayback();
    expect(useSpotifyStore.getState().nowPlaying.playback).toMatchObject({ kind: 'track', title: 'Song', isPlaying: true });
    expect(useSpotifyStore.getState().nowPlaying.likeError).not.toBe('');
    expect(spotifySend).toHaveBeenLastCalledWith('test-token', 'GET', '/me/library/contains?uris=spotify%3Atrack%3Aid');
  });
  it.each([true, false])('sets desired playback=%s without fetching the player first', async (playing) => {
    vi.mocked(spotifySend).mockResolvedValue(null);
    await setSpotifyPlayback(playing);
    expect(spotifySend).toHaveBeenCalledTimes(1);
    expect(spotifySend).toHaveBeenCalledWith('test-token', 'PUT', playing ? '/me/player/play' : '/me/player/pause');
  });
  it('explains that an active Spotify device is required', async () => {
    vi.mocked(spotifySend).mockRejectedValueOnce(new SpotifyHttpError(404, 'No active device'));
    await setSpotifyPlayback(true);
    expect(useSpotifyStore.getState().nowPlaying.playback).toMatchObject({ kind: 'error' });
    expect(JSON.stringify(useSpotifyStore.getState().nowPlaying)).not.toContain('No active device');
  });
  it('shares a playback refresh and avoids library reads for an unchanged track', async () => {
    vi.mocked(spotifySend).mockResolvedValueOnce(track).mockResolvedValueOnce([true]);
    await Promise.all([refreshSpotifyPlayback(), refreshSpotifyPlayback()]);
    expect(spotifySend).toHaveBeenCalledTimes(2);
    vi.setSystemTime(Date.now() + 5000);
    vi.mocked(spotifySend).mockResolvedValueOnce(track);
    await refreshSpotifyPlayback();
    expect(spotifySend).toHaveBeenCalledTimes(3);
  });
  it('shares one polling interval between settings and the tray', async () => {
    vi.mocked(spotifySend).mockResolvedValue(null);
    const stopSettings = watchSpotifyPlayback();
    const stopTray = watchSpotifyPlayback();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(spotifySend).toHaveBeenCalledTimes(3);
    stopSettings();
    stopTray();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(spotifySend).toHaveBeenCalledTimes(3);
  });
  it('does not reload an already hydrated session when settings mount', async () => {
    patchSpotify({ hydrated: true });
    await hydrateSpotify();
    expect(loadSpotifySecret).not.toHaveBeenCalled();
  });
  it('changes the timer immediately and coalesces rapid music commands while the API is pending', async () => {
    usePomodoroStore.setState({ running: false });
    let release!: () => void;
    vi.mocked(spotifySend).mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve(null); })).mockResolvedValue(null);
    const stop = syncSpotifyWithTimer();
    usePomodoroStore.getState().toggle();
    expect(usePomodoroStore.getState().running).toBe(true);
    await vi.waitFor(() => expect(spotifySend).toHaveBeenCalledTimes(1));
    usePomodoroStore.getState().toggle();
    expect(usePomodoroStore.getState().running).toBe(false);
    const pending = setSpotifyPlayback(false);
    release();
    await pending;
    expect(spotifySend).toHaveBeenLastCalledWith('test-token', 'PUT', '/me/player/pause');
    stop();
  });
});

describe('Spotify volume', () => {
  it('updates the thumb immediately and sends the first value without debounce', async () => {
    let release!: () => void;
    vi.mocked(spotifySend).mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve(null); }));
    queueSpotifyVolume(30);
    expect(useSpotifyStore.getState().volumePercent).toBe(30);
    await vi.waitFor(() => expect(spotifySend).toHaveBeenCalledWith('test-token', 'PUT', '/me/player/volume?volume_percent=30'));
    // Releasing a drag must not restore the last confirmed value.
    setSpotifyVolumeLock(false);
    expect(useSpotifyStore.getState().volumePercent).toBe(30);
    release();
    await vi.advanceTimersByTimeAsync(0);
  });

  it('coalesces fast changes behind an in-flight request and keeps the latest thumb value', async () => {
    let release!: () => void;
    vi.mocked(spotifySend).mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve(null); })).mockResolvedValue(null);
    queueSpotifyVolume(20);
    await vi.waitFor(() => expect(spotifySend).toHaveBeenCalledTimes(1));
    queueSpotifyVolume(40);
    queueSpotifyVolume(80);
    expect(useSpotifyStore.getState().volumePercent).toBe(80);
    expect(spotifySend).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(120);
    expect(spotifySend).toHaveBeenCalledTimes(2);
    expect(spotifySend).toHaveBeenLastCalledWith('test-token', 'PUT', '/me/player/volume?volume_percent=80');
    expect(useSpotifyStore.getState().volumePercent).toBe(80);
  });

  it('sends volume while dragging continuously instead of waiting for the user to stop', async () => {
    vi.mocked(spotifySend).mockResolvedValue(null);
    queueSpotifyVolume(10);
    await vi.advanceTimersByTimeAsync(40);
    queueSpotifyVolume(20);
    await vi.advanceTimersByTimeAsync(40);
    queueSpotifyVolume(30);
    await vi.advanceTimersByTimeAsync(40);
    expect(spotifySend).toHaveBeenCalledTimes(2);
    expect(spotifySend).toHaveBeenLastCalledWith('test-token', 'PUT', '/me/player/volume?volume_percent=30');
  });

  it('ignores a delayed device read after a newer user change even after pointer-up', async () => {
    let release!: (body: unknown) => void;
    vi.mocked(spotifySend).mockImplementationOnce(() => new Promise((resolve) => { release = resolve; })).mockResolvedValue(null);
    const read = refreshSpotifyVolume();
    await vi.waitFor(() => expect(spotifySend).toHaveBeenCalledTimes(1));
    setSpotifyVolumeLock(true);
    queueSpotifyVolume(70);
    setSpotifyVolumeLock(false);
    release({ device: { volume_percent: 10 } });
    await read;
    await vi.advanceTimersByTimeAsync(120);
    expect(useSpotifyStore.getState().volumePercent).toBe(70);
  });

  it('restores the confirmed value and exposes an API failure', async () => {
    vi.mocked(spotifySend).mockResolvedValueOnce({ device: { volume_percent: 45 } });
    await refreshSpotifyVolume();
    vi.mocked(spotifySend).mockRejectedValueOnce(new SpotifyHttpError(404, 'No active device'));
    queueSpotifyVolume(90);
    await vi.advanceTimersByTimeAsync(120);
    expect(useSpotifyStore.getState().volumePercent).toBe(45);
    expect(useSpotifyStore.getState().volumeError).toEqual({ kind: 'no_device' });
  });
});

it('reports token throttling separately from failed credentials and preserves an existing session', async () => {
  vi.mocked(loadSpotifySecret).mockResolvedValueOnce({ accessToken: 'test-token', refreshToken: '', expiresAt: Date.now() + 3600_000, codeVerifier: 'verifier', oauthState: 'state' } as Awaited<ReturnType<typeof loadSpotifySecret>>);
  const retryAt = Date.now() + 60_000;
  vi.mocked(exchangeAuthorizationCode).mockRejectedValueOnce(new SpotifyHttpError(429, 'Too many requests', retryAt));
  patchSpotify({ connected: true, oauthPending: true, reauthRequired: false });
  await expect(acceptSpotifyRedirect('code', 'state')).rejects.toMatchObject({ status: 429 });
  expect(useSpotifyStore.getState()).toMatchObject({ connected: true, reauthRequired: false, oauthPending: false, connectError: { kind: 'rate_limit', retryAt } });
});

describe('Spotify integration switch', () => {
  it('stops commands, volume and polling without disconnecting or deleting credentials', async () => {
    vi.mocked(spotifySend).mockResolvedValue(null);
    patchSpotify({ hydrated: true });
    const stop = watchSpotifyPlayback();
    await vi.advanceTimersByTimeAsync(0);
    vi.mocked(spotifySend).mockClear();
    vi.mocked(clearSpotifySecret).mockClear();
    setSpotifyEnabled(false);
    usePomodoroStore.getState().toggle();
    await setSpotifyPlayback(true);
    queueSpotifyVolume(80);
    await refreshSpotifyVolume();
    await refreshSpotifyPlayback();
    await vi.advanceTimersByTimeAsync(90_000);
    expect(spotifySend).not.toHaveBeenCalled();
    expect(clearSpotifySecret).not.toHaveBeenCalled();
    expect(useSpotifyStore.getState()).toMatchObject({ enabled: false, connected: true });
    setSpotifyEnabled(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(useSpotifyStore.getState().connected).toBe(true);
    expect(spotifySend).toHaveBeenCalledTimes(1);
    stop();
  });

  it('does not hydrate secrets while disabled', async () => {
    setSpotifyEnabled(false);
    await hydrateSpotify();
    expect(loadSpotifySecret).not.toHaveBeenCalled();
    expect(useSpotifyStore.getState().hydrated).toBe(false);
  });

  it('ignores a response that arrives after the integration was disabled', async () => {
    let release!: (body: unknown) => void;
    vi.mocked(spotifySend).mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const pending = refreshSpotifyPlayback();
    await vi.waitFor(() => expect(spotifySend).toHaveBeenCalledTimes(1));
    setSpotifyEnabled(false);
    release(track);
    await pending;
    expect(useSpotifyStore.getState().nowPlaying).toEqual(disconnectedNowPlaying());
    expect(spotifySend).toHaveBeenCalledTimes(1);
  });
});

it('can resume immediately after Off and ignores stale pre-pause work without querying the library', async () => {
  let release!: (body: unknown) => void;
  vi.mocked(spotifySend).mockImplementationOnce(() => new Promise((resolve) => { release = resolve; })).mockResolvedValue(null);
  patchSpotify({ hydrated: true });
  const beforePause = refreshSpotifyPlayback();
  await vi.waitFor(() => expect(spotifySend).toHaveBeenCalledTimes(1));
  setSpotifyEnabled(false);
  setSpotifyEnabled(true);
  await refreshSpotifyPlayback();
  expect(spotifySend).toHaveBeenCalledTimes(2);
  release(track);
  await beforePause;
  expect(spotifySend).toHaveBeenCalledTimes(2);
});
