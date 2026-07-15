import { useCallback, useEffect, useState } from 'react';

import { useT } from '@nordly-i18n';

import { CanvasBg } from '@widgets/CanvasBg';
import { Icon } from '@shared/ui/primitives/Icon';
import type { ThemeId } from '@shared/model/theme';
import { themeLabelKey } from '@shared/model/settings';

interface WallpaperCarouselProps {
  themes: ThemeId[];
  current: ThemeId;
  onPick: (id: ThemeId) => void;
  onClose: () => void;
}

/** Full-screen wallpaper picker: a horizontal, keyboard-navigable carousel of
 * theme previews. Selecting a wallpaper applies it immediately (no confirm). */
export function WallpaperCarousel({ themes, current, onPick, onClose }: WallpaperCarouselProps) {
  const t = useT();
  const initial = Math.max(0, themes.indexOf(current));
  const [active, setActive] = useState(initial);

  const step = useCallback(
    (delta: number) => {
      setActive((i) => Math.min(themes.length - 1, Math.max(0, i + delta)));
    },
    [themes.length],
  );

  const commit = useCallback(
    (index: number) => {
      const id = themes[index];
      if (id) onPick(id);
    },
    [onPick, themes],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setActive((i) => {
          const next = Math.min(themes.length - 1, i + 1);
          commit(next);
          return next;
        });
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setActive((i) => {
          const next = Math.max(0, i - 1);
          commit(next);
          return next;
        });
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        commit(active);
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [active, commit, onClose, themes.length]);

  return (
    <div
      className="nordly-wallpaper-carousel fadein"
      role="dialog"
      aria-modal="true"
      aria-label={t('nordly.settings.wallpaper.title')}
      onClick={onClose}
    >
      <p className="nordly-wallpaper-carousel__hint mono">{t('nordly.settings.wallpaper.hint')}</p>

      <div className="nordly-wallpaper-carousel__stage" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="nordly-wallpaper-carousel__arrow focus-ring"
          aria-label={t('nordly.settings.wallpaper.prev')}
          disabled={active === 0}
          onClick={() => {
            step(-1);
            commit(Math.max(0, active - 1));
          }}
        >
          <Icon name="chevron-left" size={20} />
        </button>

        <div className="nordly-wallpaper-carousel__viewport">
          <div
            className="nordly-wallpaper-carousel__track"
            style={{ transform: `translateX(-${active * 300 + 150}px)` }}
          >
            {themes.map((id, index) => {
              const offset = index - active;
              const isActive = index === active;
              const shouldRenderPreview = Math.abs(offset) <= 1;
              return (
                <button
                  type="button"
                  key={id}
                  className={`nordly-wallpaper-card${isActive ? ' is-active' : ''}`}
                  aria-label={t('nordly.theme.aria_label', { name: t(themeLabelKey(id)) })}
                  aria-current={isActive}
                  style={{
                    opacity: Math.max(0.28, 1 - Math.abs(offset) * 0.35),
                    transform: `scale(${isActive ? 1 : 0.82})`,
                  }}
                  onClick={() => {
                    setActive(index);
                    commit(index);
                  }}
                >
                  <div className="nordly-wallpaper-card__preview">
                    {shouldRenderPreview ? (
                      <CanvasBg theme={id} mode="full" animated={false} />
                    ) : null}
                  </div>
                  <span className="nordly-wallpaper-card__label mono">{t(themeLabelKey(id))}</span>
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          className="nordly-wallpaper-carousel__arrow focus-ring"
          aria-label={t('nordly.settings.wallpaper.next')}
          disabled={active === themes.length - 1}
          onClick={() => {
            step(1);
            commit(Math.min(themes.length - 1, active + 1));
          }}
        >
          <Icon name="chevron-right" size={20} />
        </button>
      </div>

      <div className="nordly-wallpaper-carousel__dots">
        {themes.map((id, index) => (
          <button
            type="button"
            key={id}
            className={`nordly-wallpaper-carousel__dot${index === active ? ' is-active' : ''}`}
            aria-label={t(themeLabelKey(id))}
            onClick={() => {
              setActive(index);
              commit(index);
            }}
          />
        ))}
      </div>

      <button
        type="button"
        className="nordly-wallpaper-carousel__done focus-ring"
        onClick={onClose}
      >
        {t('nordly.settings.wallpaper.done')}
      </button>
    </div>
  );
}
