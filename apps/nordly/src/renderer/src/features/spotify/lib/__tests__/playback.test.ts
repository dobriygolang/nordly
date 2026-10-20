import { describe, expect, it } from 'vitest';

import {
  mapCurrentlyPlaying,
  mapDeviceVolume,
  mapProfile,
  mapSpotifyErrorMessage,
  mapTokenResponse,
  mapTrackLiked,
} from '../playback';

describe('mapCurrentlyPlaying', () => {
  it('treats a missing body as silence', () => {
    expect(mapCurrentlyPlaying(null)).toEqual({ kind: 'empty' });
    expect(mapCurrentlyPlaying({ item: null })).toEqual({ kind: 'empty' });
  });

  it('reads a track and its artists', () => {
    expect(
      mapCurrentlyPlaying({
        item: {
          id: 'track-1',
          name: 'Atlas',
          type: 'track',
          artists: [{ name: 'Ada' }, { name: 'Bea' }],
        },
      }),
    ).toEqual({
      kind: 'track',
      trackId: 'track-1',
      title: 'Atlas',
      artist: 'Ada, Bea',
    });
  });

  it('reads an episode without a like target', () => {
    expect(
      mapCurrentlyPlaying({
        item: {
          id: 'ep-1',
          name: 'Pilot',
          type: 'episode',
          show: { name: 'Night' },
        },
      }),
    ).toEqual({ kind: 'other', title: 'Pilot', artist: 'Night' });
  });

  it('rejects a malformed track', () => {
    expect(() =>
      mapCurrentlyPlaying({ item: { id: 'track-1', name: 'Atlas', type: 'track' } }),
    ).toThrow(/artists/);
  });
});

describe('mapTrackLiked', () => {
  it('requires one boolean', () => {
    expect(mapTrackLiked([true])).toBe(true);
    expect(mapTrackLiked([false])).toBe(false);
    expect(() => mapTrackLiked([])).toThrow(/library/);
    expect(() => mapTrackLiked([true, false])).toThrow(/library/);
  });
});

describe('mapDeviceVolume', () => {
  it('reads an integer percent from the active device', () => {
    expect(mapDeviceVolume({ device: { volume_percent: 40 } })).toBe(40);
    expect(mapDeviceVolume({ device: null })).toBeNull();
    expect(mapDeviceVolume({ device: { volume_percent: null } })).toBeNull();
    expect(mapDeviceVolume({})).toBeNull();
    expect(() => mapDeviceVolume({ device: { volume_percent: 40.5 } })).toThrow(/volume/);
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

describe('mapProfile', () => {
  it('uses the Spotify id when display_name is empty', () => {
    expect(mapProfile({ id: 'user-1', display_name: '' })).toEqual({
      id: 'user-1',
      displayName: 'user-1',
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
