import type { SpotifyNowPlaying } from './nowPlaying';

export interface TrayMusicLine {
  mode: 'timer' | 'music';
  kicker: string;
  title: string;
  showLike: boolean;
  liked: boolean;
  likeLabel: string;
  likeError: string;
}

export function formatPlaybackTitle(title: string, artist: string): string {
  return artist ? `${title} — ${artist}` : title;
}

export function trayMusicLine(
  now: SpotifyNowPlaying,
  taskTitle: string,
  running: boolean,
  copy: {
    timerKicker: string;
    taskKicker: string;
    ready: string;
    focus: string;
    musicKicker: string;
    nothingPlaying: string;
    like: string;
    unlike: string;
  },
): TrayMusicLine {
  if (!now.connected) {
    const pinned = taskTitle.trim();
    return {
      mode: 'timer',
      kicker: pinned ? copy.taskKicker : copy.timerKicker,
      title: pinned || (running ? copy.focus : copy.ready),
      showLike: false,
      liked: false,
      likeLabel: copy.like,
      likeError: '',
    };
  }

  const playback = now.playback;
  let title = copy.nothingPlaying;
  if (playback.kind === 'track' || playback.kind === 'other') {
    title = formatPlaybackTitle(playback.title, playback.artist);
  } else if (playback.kind === 'error') {
    title = playback.message;
  }

  const showLike = playback.kind === 'track' && now.canLike === true && !now.likeError;
  return {
    mode: 'music',
    kicker: copy.musicKicker,
    title,
    showLike,
    liked: showLike && now.liked,
    likeLabel: now.liked ? copy.unlike : copy.like,
    likeError: now.likeError,
  };
}
