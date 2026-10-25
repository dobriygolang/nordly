import { describe, expect, it } from 'vitest';

import {
  mapSpotifyErrorMessage,
  mapTokenResponse,
  mapTrackLiked,
} from '../playback';

describe('mapTrackLiked', () => {
  it('requires one boolean', () => {
    expect(mapTrackLiked([true])).toBe(true);
    expect(mapTrackLiked([false])).toBe(false);
    expect(() => mapTrackLiked([])).toThrow(/library/);
    expect(() => mapTrackLiked([true, false])).toThrow(/library/);
  });
});

describe('mapTokenResponse', () => {
  it('keeps the previous refresh token when Spotify omits a new one', () => {
    expect(
      mapTokenResponse(
        { access_token: 'access', expires_in: 3600 },
        'refresh-old',
      ),
    ).toEqual({
      accessToken: 'access',
      refreshToken: 'refresh-old',
      expiresIn: 3600,
    });
  });
});

describe('mapSpotifyErrorMessage', () => {
  it('reads both OAuth and Web API error shapes', () => {
    expect(mapSpotifyErrorMessage({ error: 'invalid_grant', error_description: 'expired' }, 400)).toBe(
      'expired',
    );
    expect(mapSpotifyErrorMessage({ error: { status: 403, message: 'Premium required' } }, 403)).toBe(
      'Premium required',
    );
  });
});
