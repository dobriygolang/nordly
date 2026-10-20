import { create } from 'zustand';

import { disconnectedNowPlaying, type SpotifyNowPlaying } from './nowPlaying';

export type SpotifyConnectError =
  | { kind: 'denied' }
  | { kind: 'invalid' }
  | { kind: 'state' }
  | { kind: 'timeout' }
  | { kind: 'desktop' }
  | { kind: 'exchange'; detail: string };

export type SpotifyVolumeError = { kind: 'no_device' } | { kind: 'api'; message: string };

export interface SpotifyState {
  hydrated: boolean;
  connected: boolean;
  reauthRequired: boolean;
  displayName: string;
  oauthPending: boolean;
  connectError: SpotifyConnectError | null;
  volumePercent: number | null;
  volumeError: SpotifyVolumeError | null;
  nowPlaying: SpotifyNowPlaying;
}

export const useSpotifyStore = create<SpotifyState>(() => ({
  hydrated: false,
  connected: false,
  reauthRequired: false,
  displayName: '',
  oauthPending: false,
  connectError: null,
  volumePercent: null,
  volumeError: null,
  nowPlaying: disconnectedNowPlaying(),
}));

export function patchSpotify(partial: Partial<SpotifyState>): void {
  useSpotifyStore.setState(partial);
}
