import type { PlaybackItem } from './playback';

export const SPOTIFY_NOW_EVENT = 'spotify:now-playing';
export const SPOTIFY_CMD_EVENT = 'spotify:cmd';
export const SPOTIFY_POLL_MS = 15_000;
const DEFAULT_SPOTIFY_REDIRECT_URI = 'https://trynordly.app/oauth/spotify';

function readSpotifyRedirectUri(): string {
  const override = import.meta.env.VITE_SPOTIFY_REDIRECT_URI;
  if (typeof override === 'string' && override.trim()) return override.trim();
  return DEFAULT_SPOTIFY_REDIRECT_URI;
}

/** HTTPS page. Spotify will not accept nordly:// as a redirect URI. The page forwards code and state into the app. */
export const SPOTIFY_REDIRECT_URI = readSpotifyRedirectUri();

export interface SpotifyNowPlaying {
  connected: boolean;
  playback: PlaybackItem | { kind: 'error'; message: string };
  liked: boolean;
  likeError: string;
}

export function disconnectedNowPlaying(): SpotifyNowPlaying {
  return {
    connected: false,
    playback: { kind: 'empty' },
    liked: false,
    likeError: '',
  };
}
