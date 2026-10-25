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

export function mapTrackLiked(body: unknown): boolean {
  if (!Array.isArray(body) || body.length !== 1 || typeof body[0] !== 'boolean') {
    throw new Error('Invalid Spotify library response');
  }
  return body[0];
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
