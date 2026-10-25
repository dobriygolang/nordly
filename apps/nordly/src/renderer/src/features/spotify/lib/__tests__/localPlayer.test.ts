import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { NordlyAPI, SpotifyLocalSnapshot } from '@platform/ipc';

vi.mock('@platform/runtime', () => ({ isTauriRuntime: () => true }));
vi.mock('@tauri-apps/api/event', () => ({ emit: vi.fn(), listen: vi.fn(async () => vi.fn()) }));
vi.mock('../secret', () => ({ loadSpotifySecret: vi.fn(), saveSpotifySecret: vi.fn(), clearSpotifySecret: vi.fn() }));
vi.mock('../../remote/spotifyRemote', async (original) => ({
  ...await original<typeof import('../../remote/spotifyRemote')>(), spotifyLibrarySend: vi.fn(),
}));

const snapshot: SpotifyLocalSnapshot = { status: 'ready', title: 'Song\nwith special | characters', artist: 'Artist', trackId: 'id', playing: true, volume: 50 };
const read = vi.fn(async (_requestAccess: boolean) => snapshot);
const playback = vi.fn(async (playing: boolean): Promise<SpotifyLocalSnapshot> => ({ ...snapshot, playing }));
const volume = vi.fn(async (percent: number): Promise<SpotifyLocalSnapshot> => ({ ...snapshot, volume: percent }));
let player: typeof import('../localPlayer');
let store: typeof import('../spotifyStore');

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-25T10:00:00Z'));
  read.mockResolvedValue(snapshot);
  playback.mockImplementation(async (playing) => ({ ...snapshot, playing }));
  volume.mockImplementation(async (percent) => ({ ...snapshot, volume: percent }));
  window.nordly = { spotifyPlayer: { read, playback, volume } } as unknown as NordlyAPI;
  player = await import('../localPlayer');
  store = await import('../spotifyStore');
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

it('boots the native integration without a client id and without hydrating optional credentials', async () => {
  vi.stubEnv('VITE_SPOTIFY_CLIENT_ID', '');
  const { initSpotifyLeader } = await import('../spotifySession');
  const stop = initSpotifyLeader();
  await player.refreshSpotifyPlayback();
  expect(read).toHaveBeenCalledTimes(1);
  expect((await import('../secret')).loadSpotifySecret).not.toHaveBeenCalled();
  expect((await import('../../remote/spotifyRemote')).spotifyLibrarySend).not.toHaveBeenCalled();
  stop();
});

it('reads the local player without secrets, OAuth or Web API, preserving literal track text', async () => {
  await player.hydrateSpotify();
  expect(read).toHaveBeenCalledWith(false);
  expect(store.useSpotifyStore.getState().nowPlaying.playback).toMatchObject({ kind: 'track', title: snapshot.title });
  expect((await import('../secret')).loadSpotifySecret).not.toHaveBeenCalled();
  expect((await import('../../remote/spotifyRemote')).spotifyLibrarySend).not.toHaveBeenCalled();
});

it('never prompts during background reads; explicit settings action requests access', async () => {
  read.mockResolvedValue({ ...snapshot, status: 'permission_required' });
  await player.hydrateSpotify();
  expect(store.useSpotifyStore.getState()).toMatchObject({ connected: false, localStatus: 'permission_required' });
  expect(read).toHaveBeenCalledWith(false);
  await player.requestSpotifyLocalAccess();
  expect(read).toHaveBeenLastCalledWith(true);
});

it('shares a single local poller and stops when all visible consumers close', async () => {
  const stopSettings = player.watchSpotifyPlayback();
  const stopTray = player.watchSpotifyPlayback();
  await vi.advanceTimersByTimeAsync(4000);
  expect(read).toHaveBeenCalledTimes(3);
  stopSettings(); stopTray();
  await vi.advanceTimersByTimeAsync(4000);
  expect(read).toHaveBeenCalledTimes(3);
});

it('disables all new local operations and resumes without disconnecting the library', async () => {
  store.patchSpotify({ libraryConnected: true });
  player.setSpotifyEnabled(false);
  await player.hydrateSpotify(); await player.setSpotifyPlayback(true); player.queueSpotifyVolume(20);
  expect(read).not.toHaveBeenCalled(); expect(playback).not.toHaveBeenCalled(); expect(volume).not.toHaveBeenCalled();
  expect(store.useSpotifyStore.getState().libraryConnected).toBe(true);
  player.setSpotifyEnabled(true);
  await player.refreshSpotifyPlayback();
  expect(read).toHaveBeenCalledTimes(1);
});

it('ignores a native response from before Off → On', async () => {
  let release!: (value: SpotifyLocalSnapshot) => void;
  read.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
  const old = player.refreshSpotifyPlayback();
  player.setSpotifyEnabled(false); player.setSpotifyEnabled(true);
  await player.refreshSpotifyPlayback();
  release({ ...snapshot, title: 'Stale track' }); await old;
  expect(store.useSpotifyStore.getState().nowPlaying.playback).toMatchObject({ title: snapshot.title });
});

it('updates the timer immediately and coalesces pending playback commands', async () => {
  const { usePomodoroStore } = await import('@shared/model/pomodoro');
  usePomodoroStore.setState({ running: false });
  let release!: (value: SpotifyLocalSnapshot) => void;
  playback.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
  const stop = player.syncSpotifyWithTimer();
  usePomodoroStore.getState().toggle();
  expect(usePomodoroStore.getState().running).toBe(true);
  expect(playback).toHaveBeenCalledWith(true);
  usePomodoroStore.getState().toggle();
  expect(usePomodoroStore.getState().running).toBe(false);
  const pending = player.setSpotifyPlayback(false);
  release(snapshot); await pending;
  expect(playback).toHaveBeenLastCalledWith(false);
  stop();
});

it('keeps the volume thumb immediate and sends only the final queued value', async () => {
  store.patchSpotify({ connected: true });
  let release!: (value: SpotifyLocalSnapshot) => void;
  volume.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
  player.queueSpotifyVolume(20); player.queueSpotifyVolume(40); player.queueSpotifyVolume(75);
  expect(store.useSpotifyStore.getState().volumePercent).toBe(75);
  expect(volume).toHaveBeenCalledTimes(1);
  release({ ...snapshot, volume: 20 });
  await vi.advanceTimersByTimeAsync(120);
  expect(volume).toHaveBeenLastCalledWith(75);
  expect(volume).toHaveBeenCalledTimes(2);
  expect(store.useSpotifyStore.getState().volumePercent).toBe(75);
});

it('rejects delayed reads after a newer volume choice', async () => {
  store.patchSpotify({ connected: true });
  let release!: (value: SpotifyLocalSnapshot) => void;
  read.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
  const pending = player.refreshSpotifyPlayback();
  player.queueSpotifyVolume(70);
  await vi.advanceTimersByTimeAsync(0);
  release(snapshot); await pending;
  expect(store.useSpotifyStore.getState().volumePercent).toBe(70);
});

it('restores confirmed volume and exposes a native write failure', async () => {
  await player.refreshSpotifyPlayback();
  volume.mockRejectedValueOnce(new Error('Audio device disappeared'));
  player.queueSpotifyVolume(80);
  await vi.advanceTimersByTimeAsync(0);
  expect(store.useSpotifyStore.getState()).toMatchObject({ volumePercent: 50, volumeError: { kind: 'api', message: 'Audio device disappeared' } });
});

it('reports a missing local process without inventing a track', async () => {
  read.mockResolvedValue({ ...snapshot, status: 'not_running', title: '', trackId: null, volume: null });
  await player.refreshSpotifyPlayback();
  expect(store.useSpotifyStore.getState()).toMatchObject({ connected: false, localStatus: 'not_running', volumePercent: null });
  expect(store.useSpotifyStore.getState().nowPlaying.connected).toBe(false);
});
