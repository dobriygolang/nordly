import { useEffect, useState } from 'react';

import { useT } from '@nordly-i18n';

import {
  queueSpotifyVolume,
  refreshSpotifyVolume,
  setSpotifyVolumeLock,
  useSpotifyStore,
  type SpotifyVolumeError,
} from '@features/spotify/api/spotifyClient';
import { Icon } from '@shared/ui/primitives/Icon';

function volumeErrorText(
  t: ReturnType<typeof useT>,
  error: SpotifyVolumeError,
): string {
  if (error.kind === 'no_device') return t('nordly.dock.spotify_volume_no_device');
  return error.message;
}

export function DockVolume(): JSX.Element | null {
  const t = useT();
  const enabled = useSpotifyStore((s) => s.enabled);
  const connected = useSpotifyStore((s) => s.connected);
  const volumePercent = useSpotifyStore((s) => s.volumePercent);
  const volumeError = useSpotifyStore((s) => s.volumeError);
  const [pinned, setPinned] = useState(false);
  useEffect(() => () => setSpotifyVolumeLock(false), []);

  if (!enabled || !connected) return null;

  const shown = volumePercent ?? 0;
  const muted = volumePercent === 0;
  const title = volumeError
    ? volumeErrorText(t, volumeError)
    : t('nordly.dock.spotify_volume', { volume: shown });

  return (
    <div
      className={`nordly-dock-volume${pinned ? ' is-pinned' : ''}`}
      onMouseEnter={() => {
        void refreshSpotifyVolume();
      }}
      onFocus={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) void refreshSpotifyVolume();
      }}
    >
      <button
        type="button"
        className="focus-ring nordly-dock-btn nordly-dock-volume__btn"
        aria-label={title}
        title={title}
        aria-expanded={pinned}
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          opacity: muted ? 0.5 : 1,
        }}
      >
        <Icon name="volume" size={14} />
      </button>
      <div className="nordly-dock-volume__slider">
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={shown}
          aria-label={t('nordly.dock.spotify_volume_label')}
          aria-valuetext={title}
          className="nordly-dock-vol"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            setPinned(true);
            setSpotifyVolumeLock(true);
          }}
          onPointerUp={() => {
            setPinned(false);
            setSpotifyVolumeLock(false);
          }}
          onPointerCancel={() => {
            setPinned(false);
            setSpotifyVolumeLock(false);
          }}
          onChange={(event) => {
            const next = Number(event.target.value);
            queueSpotifyVolume(next);
          }}
        />
      </div>
    </div>
  );
}
