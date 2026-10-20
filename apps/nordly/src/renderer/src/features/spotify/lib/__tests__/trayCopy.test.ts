import { describe, expect, it } from 'vitest';

import { disconnectedNowPlaying, type SpotifyNowPlaying } from '../nowPlaying';
import { trayMusicLine } from '../trayCopy';

const copy = {
  timerKicker: 'Timer',
  taskKicker: 'Task',
  ready: 'Ready',
  focus: 'Focus',
  musicKicker: 'Music',
  nothingPlaying: 'Nothing playing',
  like: 'Like',
  unlike: 'Unlike',
};

function line(now: SpotifyNowPlaying, taskTitle = '', running = false) {
  return trayMusicLine(now, taskTitle, running, copy);
}

describe('trayMusicLine', () => {
  it('keeps the timer copy until Spotify is connected', () => {
    expect(line(disconnectedNowPlaying(), 'Write spec', false)).toMatchObject({
      mode: 'timer',
      kicker: 'Task',
      title: 'Write spec',
      showLike: false,
    });
    expect(line(disconnectedNowPlaying(), '', true)).toMatchObject({
      mode: 'timer',
      kicker: 'Timer',
      title: 'Focus',
    });
  });

  it('replaces the timer line with the current track', () => {
    const row = line({
      connected: true,
      playback: { kind: 'track', trackId: 't1', title: 'Atlas', artist: 'Ada' },
      liked: true,
      likeError: '',
    }, 'Write spec', true);
    expect(row).toMatchObject({
      mode: 'music',
      kicker: 'Music',
      title: 'Atlas — Ada',
      showLike: true,
      liked: true,
      likeLabel: 'Unlike',
    });
  });

  it('hides the heart when nothing is playing or the item is not a track', () => {
    expect(
      line({
        connected: true,
        playback: { kind: 'empty' },
        liked: false,
        likeError: '',
      }).showLike,
    ).toBe(false);
    expect(
      line({
        connected: true,
        playback: { kind: 'other', title: 'Pilot', artist: 'Night' },
        liked: false,
        likeError: '',
      }),
    ).toMatchObject({ title: 'Pilot — Night', showLike: false });
  });

  it('surfaces a playback error in the title', () => {
    expect(
      line({
        connected: true,
        playback: { kind: 'error', message: 'Premium required' },
        liked: false,
        likeError: '',
      }).title,
    ).toBe('Premium required');
  });
});
