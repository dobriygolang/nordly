import { SPOTIFY_REDIRECT_URI } from './nowPlaying';

const SCOPES = [
  'user-library-read',
  'user-library-modify',
].join(' ');

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export interface PkcePair {
  verifier: string;
  challenge: string;
  state: string;
}

export async function createPkce(): Promise<PkcePair> {
  const verifierBytes = crypto.getRandomValues(new Uint8Array(32));
  const verifier = base64Url(verifierBytes);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = base64Url(new Uint8Array(digest));
  const state = base64Url(crypto.getRandomValues(new Uint8Array(16)));
  return { verifier, challenge, state };
}

export function spotifyClientId(): string {
  const id = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
  return typeof id === 'string' ? id.trim() : '';
}

export function isSpotifyConfigured(): boolean {
  return spotifyClientId().length > 0;
}

export function spotifyAuthorizeUrl(clientId: string, challenge: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: SPOTIFY_REDIRECT_URI,
    state,
    scope: SCOPES,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}
