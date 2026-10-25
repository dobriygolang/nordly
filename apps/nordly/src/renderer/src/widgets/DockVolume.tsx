import { useCallback, useEffect, useRef, useState } from 'react';

import { useT } from '@nordly-i18n';

import {
  queueSpotifyVolume,
  refreshSpotifyVolume,
  setSpotifyVolumeLock,
  useSpotifyStore,
} from '@features/spotify/api/spotifyClient';
import { Icon } from '@shared/ui/primitives/Icon';

export function DockVolume(): JSX.Element | null {
  const t = useT();
  const enabled = useSpotifyStore((s) => s.enabled);
  const connected = useSpotifyStore((s) => s.connected);
  const volumePercent = useSpotifyStore((s) => s.volumePercent);
  const volumeError = useSpotifyStore((s) => s.volumeError);
  const [pinned, setPinned] = useState(false);
  const pointerHeld = useRef(false);
  const pointerInteraction = useRef(false);
  const stopDrag = useCallback(() => {
    if (!pointerHeld.current) return;
    pointerHeld.current = false;
    setPinned(false);
    setSpotifyVolumeLock(false);
  }, []);
  useEffect(() => {
    window.addEventListener('pointerup', stopDrag);
    window.addEventListener('mouseup', stopDrag);
    window.addEventListener('pointercancel', stopDrag);
    window.addEventListener('blur', stopDrag);
    return () => {
      window.removeEventListener('pointerup', stopDrag);
      window.removeEventListener('mouseup', stopDrag);
      window.removeEventListener('pointercancel', stopDrag);
      window.removeEventListener('blur', stopDrag);
      setSpotifyVolumeLock(false);
    };
  }, [stopDrag]);

  if (!enabled || !connected || (volumePercent === null && !volumeError)) return null;

  const shown = volumePercent ?? 0;
  const muted = volumePercent === 0;
  const title = volumeError
    ? volumeError.message
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
            if (event.button !== 0) return;
            pointerHeld.current = true;
            pointerInteraction.current = true;
            setPinned(true);
            setSpotifyVolumeLock(true);
          }}
          onPointerMove={(event) => {
            if (pointerHeld.current && (event.buttons & 1) === 0) stopDrag();
          }}
          onPointerUp={stopDrag}
          onPointerCancel={stopDrag}
          onLostPointerCapture={stopDrag}
          onKeyDown={() => { pointerInteraction.current = false; }}
          onFocus={() => { if (!pointerHeld.current) pointerInteraction.current = false; }}
          onBlur={stopDrag}
          onChange={(event) => {
            if (pointerInteraction.current && !pointerHeld.current) {
              event.currentTarget.value = String(useSpotifyStore.getState().volumePercent ?? 0);
              return;
            }
            const next = Number(event.target.value);
            queueSpotifyVolume(next);
          }}
        />
      </div>
    </div>
  );
}
