import { useCallback, useMemo, useState } from 'react';

import { useLocale, useT, type Locale } from '@nordly-i18n';

import type { BoardCanvasTheme } from '@shared/lib/excalidraw/nordlyTheme';
import { applyTextScale } from '@shared/model/accessibility';
import {
  TEXT_SCALES,
  TextScale,
  WeekStartsOn,
  themeLabelKey,
  type NordlySettings,
} from '@shared/model/settings';
import { persistTheme, THEME_IDS, type ThemeId } from '@shared/model/theme';
import { SegmentedControl } from '@shared/ui/primitives/SegmentedControl';
import { WallpaperCarousel } from '../../WallpaperCarousel';
import { SettingRow, SettingsBlock } from '../../primitives/SettingRow';

const LOCALES: Locale[] = ['ru', 'en'];
const WEEK_STARTS = Object.values(WeekStartsOn);

interface AppearanceSettingsBlockProps {
  settings: NordlySettings;
  update: (patch: Partial<NordlySettings>) => void;
  theme: ThemeId;
  onThemeChange: (theme: ThemeId) => void;
  boardCanvas: BoardCanvasTheme;
  onBoardCanvasChange: (theme: BoardCanvasTheme) => void;
}

export function AppearanceSettingsBlock({
  settings,
  update,
  theme,
  onThemeChange,
  boardCanvas,
  onBoardCanvasChange,
}: AppearanceSettingsBlockProps): JSX.Element {
  const t = useT();
  const [locale, setLocale] = useLocale();
  const [carouselOpen, setCarouselOpen] = useState(false);

  const localeOptions = useMemo(
    () =>
      LOCALES.map((value) => ({
        value,
        label:
          value === 'ru' ? t('common.lang.ru') : t('common.lang.en'),
      })),
    [t],
  );
  const weekStartsOptions = useMemo(
    () =>
      WEEK_STARTS.map((value) => ({
        value,
        label:
          value === WeekStartsOn.Monday
            ? t('nordly.settings.week_starts.monday')
            : t('nordly.settings.week_starts.sunday'),
      })),
    [t],
  );
  const textScaleOptions = useMemo(
    () =>
      TEXT_SCALES.map((value) => ({
        value,
        label:
          value === TextScale.Normal
            ? t('nordly.settings.text_scale.normal')
            : value === TextScale.Large
              ? t('nordly.settings.text_scale.large')
              : t('nordly.settings.text_scale.xlarge'),
      })),
    [t],
  );
  const boardCanvasOptions = useMemo(
    () => [
      {
        value: 'dark' as const,
        label: t('nordly.settings.board_canvas.dark'),
      },
      {
        value: 'light' as const,
        label: t('nordly.settings.board_canvas.light'),
      },
    ],
    [t],
  );

  const setTextScale = useCallback(
    (textScale: TextScale) => {
      update({ textScale });
      applyTextScale(textScale);
    },
    [update],
  );
  const setBoardCanvas = useCallback(
    (next: BoardCanvasTheme) => {
      onBoardCanvasChange(next);
      update({ boardCanvas: next });
    },
    [onBoardCanvasChange, update],
  );
  const pickTheme = useCallback(
    (next: ThemeId) => {
      onThemeChange(next);
      persistTheme(next);
    },
    [onThemeChange],
  );

  return (
    <>
      <SettingsBlock title={t('nordly.settings.section.appearance')}>
        <SettingRow
          label={t('nordly.settings.wallpaper.label')}
          hint={t('nordly.settings.wallpaper.row_hint', {
            name: t(themeLabelKey(theme)),
          })}
        >
          <button
            type="button"
            className="nordly-settings-change-btn focus-ring"
            onClick={() => setCarouselOpen(true)}
          >
            {t('nordly.settings.wallpaper.change')}
          </button>
        </SettingRow>

        <SettingRow
          label={t('nordly.settings.language.label')}
          hint={t('nordly.settings.language.hint')}
        >
          <SegmentedControl
            ariaLabel={t('nordly.settings.language.label')}
            value={locale}
            options={localeOptions}
            onChange={setLocale}
          />
        </SettingRow>

        <SettingRow
          label={t('nordly.settings.week_starts.label')}
          hint={t('nordly.settings.week_starts.hint')}
        >
          <SegmentedControl
            ariaLabel={t('nordly.settings.week_starts.label')}
            value={settings.weekStartsOn}
            options={weekStartsOptions}
            onChange={(weekStartsOn) => update({ weekStartsOn })}
          />
        </SettingRow>

        <SettingRow
          label={t('nordly.settings.text_scale.label')}
          hint={t('nordly.settings.text_scale.hint')}
        >
          <SegmentedControl
            ariaLabel={t('nordly.settings.text_scale.label')}
            value={settings.textScale}
            options={textScaleOptions}
            onChange={setTextScale}
          />
        </SettingRow>

        <SettingRow
          label={t('nordly.settings.board_canvas.label')}
          hint={t('nordly.settings.board_canvas.hint')}
        >
          <SegmentedControl
            ariaLabel={t('nordly.settings.board_canvas.label')}
            value={boardCanvas}
            options={boardCanvasOptions}
            onChange={setBoardCanvas}
          />
        </SettingRow>
      </SettingsBlock>

      {carouselOpen ? (
        <WallpaperCarousel
          themes={THEME_IDS}
          current={theme}
          onPick={pickTheme}
          onClose={() => setCarouselOpen(false)}
        />
      ) : null}
    </>
  );
}
