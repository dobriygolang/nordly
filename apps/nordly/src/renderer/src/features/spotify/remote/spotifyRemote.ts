import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

import { isNativeHttpInTauri } from '@platform/runtime';

import { SPOTIFY_REDIRECT_URI } from '../lib/nowPlaying';
import {
  mapSpotifyErrorMessage,
  type SpotifyTokens,
  mapTokenResponse,
} from '../lib/playback';

const API = 'https://api.spotify.com/v1';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';

export class SpotifyHttpError extends Error {
  readonly status: number;
  readonly retryAt: number;

  constructor(status: number, message: string, retryAt = 0) {
    super(message);
    this.name = 'SpotifyHttpError';
    this.status = status;
    this.retryAt = retryAt;
  }
}

type RequestScope = 'playback' | 'accounts';
const limits: Record<RequestScope, { retryAt: number; count: number }> = {
  playback: { retryAt: 0, count: 0 },
  accounts: { retryAt: 0, count: 0 },
};

export function spotifyRetryAt(): number { return limits.playback.retryAt; }
export function spotifyAuthRetryAt(): number { return limits.accounts.retryAt; }

function checkRateLimit(scope: RequestScope): void {
  const { retryAt } = limits[scope];
  if (Date.now() < retryAt) throw new SpotifyHttpError(429, 'Too many requests', retryAt);
}

function coreFetch(input: string, init?: RequestInit): Promise<Response> {
  return isNativeHttpInTauri() ? tauriFetch(input, init) : fetch(input, init);
}

async function parseBody(resp: Response): Promise<unknown> {
  const text = await resp.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new SpotifyHttpError(resp.status, `Spotify request failed (${resp.status})`);
  }
}

async function finish(resp: Response, scope: RequestScope): Promise<unknown> {
  const limit = limits[scope];
  if (resp.status === 429) {
    limit.count += 1;
    const seconds = Number(resp.headers.get('Retry-After'));
    const delay = Number.isFinite(seconds) && seconds > 0
      ? seconds * 1000 : Math.min(15 * 60_000, 30_000 * 2 ** Math.min(limit.count - 1, 5));
    limit.retryAt = Math.max(limit.retryAt, Date.now() + delay);
    throw new SpotifyHttpError(429, 'Too many requests', limit.retryAt);
  }
  if (resp.ok) limit.count = 0;
  const body = await parseBody(resp);
  if (resp.status === 204) return null;
  if (!resp.ok) {
    throw new SpotifyHttpError(resp.status, mapSpotifyErrorMessage(body, resp.status));
  }
  return body;
}

/** Spotify is not Nordly REST. apiFetch would treat a 401 as a Nordly logout. */
export async function spotifySend(
  token: string,
  method: 'GET' | 'PUT' | 'DELETE',
  path: string,
): Promise<unknown> {
  checkRateLimit('playback');
  const resp = await coreFetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });
  return finish(resp, 'playback');
}

export async function exchangeAuthorizationCode(
  clientId: string,
  code: string,
  verifier: string,
): Promise<SpotifyTokens> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: SPOTIFY_REDIRECT_URI,
    client_id: clientId,
    code_verifier: verifier,
  });
  return tokenRequest(body, '');
}

export async function refreshAccessToken(
  clientId: string,
  refreshToken: string,
): Promise<SpotifyTokens> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  });
  return tokenRequest(body, refreshToken);
}

async function tokenRequest(body: URLSearchParams, previousRefresh: string): Promise<SpotifyTokens> {
  checkRateLimit('accounts');
  const resp = await coreFetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  });
  const parsed = await finish(resp, 'accounts');
  return mapTokenResponse(parsed, previousRefresh);
}
