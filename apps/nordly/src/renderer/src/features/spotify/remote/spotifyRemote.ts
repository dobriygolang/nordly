import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

import { readSettings } from '@shared/model/settings';
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
  readonly reason: string;

  constructor(status: number, message: string, retryAt = 0, reason = '') {
    super(message);
    this.name = 'SpotifyHttpError';
    this.status = status;
    this.retryAt = retryAt;
    this.reason = reason;
  }
}

type RequestScope = 'library' | 'accounts';
const limits: Record<RequestScope, { retryAt: number; count: number; reason: string }> = {
  library: { retryAt: 0, count: 0, reason: '' },
  accounts: { retryAt: 0, count: 0, reason: '' },
};

export function spotifyLibraryRetryAt(): number { return limits.library.retryAt; }
export function spotifyAuthRetryAt(): number { return limits.accounts.retryAt; }

function checkRateLimit(scope: RequestScope): void {
  const { retryAt, reason } = limits[scope];
  if (Date.now() < retryAt) throw new SpotifyHttpError(429, 'Too many requests', retryAt, reason);
}

const libraryRequests = new Set<AbortController>();
export function abortSpotifyLibraryRequests(): void {
  for (const controller of libraryRequests) controller.abort();
}

function coreFetch(input: string, init?: RequestInit): Promise<Response> {
  if (!readSettings().spotifyEnabled) return Promise.reject(new Error('Spotify integration is disabled'));
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
    // 429 may be JSON (quota metadata) or a plain-text rate-limit response.
    // Optional diagnostic metadata must not hide the HTTP throttling status.
    let reason = '';
    const raw = await resp.text();
    if (raw.trimStart().startsWith('{')) {
      try {
        const body = JSON.parse(raw) as { error?: { reason?: unknown } } | null;
        if (typeof body?.error?.reason === 'string') reason = body.error.reason;
      } catch (error) {
        console.warn('[nordly:spotify] invalid rate-limit metadata', error);
      }
    }
    limit.reason = reason;
    const seconds = Number(resp.headers.get('Retry-After'));
    const delay = Number.isFinite(seconds) && seconds > 0
      ? seconds * 1000
      : reason === 'QUOTA_EXCEEDED' ? 15 * 60_000
      : Math.min(15 * 60_000, 30_000 * 2 ** Math.min(limit.count - 1, 5));
    limit.retryAt = Math.max(limit.retryAt, Date.now() + delay);
    throw new SpotifyHttpError(429, 'Too many requests', limit.retryAt, reason);
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
export async function spotifyLibrarySend(
  token: string,
  method: 'GET' | 'PUT' | 'DELETE',
  path: string,
): Promise<unknown> {
  if (!/^\/me\/library(?:\/contains)?\?uris=/.test(path)) {
    throw new Error('Only explicit Spotify library actions use the Web API');
  }
  checkRateLimit('library');
  const controller = new AbortController();
  libraryRequests.add(controller);
  try {
    const resp = await coreFetch(`${API}${path}`, {
      method,
      signal: controller.signal,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    return await finish(resp, 'library');
  } finally {
    libraryRequests.delete(controller);
  }
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
