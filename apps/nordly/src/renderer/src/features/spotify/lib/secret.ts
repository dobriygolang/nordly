export interface SpotifySecret {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  codeVerifier: string;
  oauthState: string;
}

export function emptySecret(): SpotifySecret {
  return {
    accessToken: '',
    refreshToken: '',
    expiresAt: 0,
    codeVerifier: '',
    oauthState: '',
  };
}

function bridge() {
  const spotify = window.nordly?.spotify;
  if (!spotify) throw new Error('Spotify keychain is only available in the desktop app');
  return spotify;
}

export async function loadSpotifySecret(): Promise<SpotifySecret | null> {
  return bridge().load();
}

export async function saveSpotifySecret(secret: SpotifySecret): Promise<void> {
  await bridge().save(secret);
}

export async function clearSpotifySecret(): Promise<void> {
  await bridge().clear();
}
