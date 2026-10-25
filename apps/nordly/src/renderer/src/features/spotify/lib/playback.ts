/** Spotify Web API JSON is snake_case. One shape; mismatch throws. */

export type PlaybackItem =
  | { kind: 'empty' }
  | { kind: 'track'; trackId: string; title: string; artist: string; isPlaying?: boolean }
  | { kind: 'other'; title: string; artist: string; isPlaying?: boolean };

export interface SpotifyTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface SpotifyProfile {
  id: string;
  displayName: string;
}

function asRecord(body: unknown, label: string): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error(`Invalid Spotify ${label}`);
  }
  return body as Record<string, unknown>;
}

function requireString(obj: Record<string, unknown>, key: string, label: string): string {
  const value = obj[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid Spotify ${label}: missing ${key}`);
  }
  return value;
}

function trackArtist(item: Record<string, unknown>): string {
  const artists = item.artists;
  if (!Array.isArray(artists)) throw new Error('Invalid Spotify track: missing artists');
  const names: string[] = [];
  for (const artist of artists) {
    if (!artist || typeof artist !== 'object' || Array.isArray(artist)) {
      throw new Error('Invalid Spotify track: bad artist');
    }
    names.push(requireString(artist as Record<string, unknown>, 'name', 'track'));
  }
  return names.join(', ');
}

export function mapCurrentlyPlaying(body: unknown): PlaybackItem {
  if (body === null) return { kind: 'empty' };
  const obj = asRecord(body, 'playback');
  const item = obj.item;
  if (item === null || item === undefined) return { kind: 'empty' };
  const track = asRecord(item, 'item');
  const type = requireString(track, 'type', 'item');
  const title = requireString(track, 'name', 'item');
  if (type === 'track') {
    return {
      kind: 'track',
      trackId: requireString(track, 'id', 'track'),
      title,
      isPlaying: obj.is_playing === true,
      artist: trackArtist(track),
    };
  }
  if (type === 'episode') {
    let artist = '';
    const show = track.show;
    if (show !== undefined && show !== null) {
      artist = requireString(asRecord(show, 'show'), 'name', 'show');
    }
    return { kind: 'other', title, artist, isPlaying: obj.is_playing === true };
  }
  throw new Error(`Invalid Spotify item type: ${type}`);
}

export function mapTrackLiked(body: unknown): boolean {
  if (!Array.isArray(body) || body.length !== 1 || typeof body[0] !== 'boolean') {
    throw new Error('Invalid Spotify library response');
  }
  return body[0];
}

export function mapDeviceVolume(body: unknown): number | null {
  const player = asRecord(body, 'player');
  if (player.device == null) return null;
  const device = asRecord(player.device, 'device');
  const volume = device.volume_percent;
  if (volume == null) return null;
  if (typeof volume !== 'number' || !Number.isInteger(volume) || volume < 0 || volume > 100) {
    throw new Error('Invalid Spotify volume');
  }
  return volume;
}

export function mapTokenResponse(body: unknown, previousRefresh: string): SpotifyTokens {
  const obj = asRecord(body, 'token');
  const accessToken = requireString(obj, 'access_token', 'token');
  const refreshRaw = obj.refresh_token;
  const refreshToken =
    typeof refreshRaw === 'string' && refreshRaw.length > 0 ? refreshRaw : previousRefresh;
  if (!refreshToken) throw new Error('Invalid Spotify token: missing refresh_token');
  const expiresIn = obj.expires_in;
  if (typeof expiresIn !== 'number' || !Number.isInteger(expiresIn) || expiresIn <= 0) {
    throw new Error('Invalid Spotify token: missing expires_in');
  }
  return { accessToken, refreshToken, expiresIn };
}

export function mapProfile(body: unknown): SpotifyProfile {
  const obj = asRecord(body, 'profile');
  const id = requireString(obj, 'id', 'profile');
  const display = obj.display_name;
  const displayName =
    typeof display === 'string' && display.length > 0 ? display : id;
  return { id, displayName };
}

export function mapSpotifyErrorMessage(body: unknown, status: number): string {
  if (!body || typeof body !== 'object') return `Spotify request failed (${status})`;
  const obj = body as Record<string, unknown>;
  const error = obj.error;
  if (typeof error === 'string' && error.length > 0) {
    const description = obj.error_description;
    if (typeof description === 'string' && description.length > 0) return description;
    return error;
  }
  if (error && typeof error === 'object' && !Array.isArray(error)) {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === 'string' && message.length > 0) return message;
  }
  return `Spotify request failed (${status})`;
}
