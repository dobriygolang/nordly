import { useCallback, useMemo, useState } from 'react';

import { useT, useLocale, type Locale } from '@nordly-i18n';

import { type ThemeId, THEME_IDS } from '@shared/model/theme';
import type { BoardCanvasTheme } from '@shared/lib/excalidraw/nordlyTheme';
import { applyTextScale } from '@shared/model/accessibility';
import {
  patchSettings,
  readSettings,
  TEXT_SCALES,
  THEME_KEY,
  themeLabelKey,
  type NordlySettings,
  type TextScale,
  type TimerMode,
} from '@shared/model/settings';
import { SegmentedControl } from '@shared/ui/primitives/SegmentedControl';
import { SettingRow, SettingsBlock } from '../primitives/SettingRow';
import { Slider } from '../primitives/Slider';
import { Toggle } from '../primitives/Toggle';
import { WallpaperCarousel } from '../WallpaperCarousel';

const LOCALES: Locale[] = ['ru', 'en'];

interface GeneralSectionProps {
  theme: ThemeId;
  onThemeChange: (t: ThemeId) => void;
  boardCanvas: BoardCanvasTheme;
  onBoardCanvasChange: (t: BoardCanvasTheme) => void;
  onPomoChange?: (secs: number) => void;
  onTimerModeChange?: (mode: TimerMode) => void;
}

function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
}

export function GeneralSection({
  theme,
  onThemeChange,
  boardCanvas,
  onBoardCanvasChange,
  onPomoChange,
  onTimerModeChange,
}: GeneralSectionProps) {
  const t = useT();
  const [locale, setLocale] = useLocale();
  const [settings, setSettings] = useState<NordlySettings>(() => readSettings());
  const [carouselOpen, setCarouselOpen] = useState(false);

  const update = useCallback((patch: Partial<NordlySettings>) => {
    setSettings(patchSettings(patch));
  }, []);

  const setPomo = useCallback(
    (n: number) => {
      update({ pomodoroMinutes: n });
      onPomoChange?.(n * 60);
    },
    [onPomoChange, update],
  );

  const setDailyGoal = useCallback((n: number) => update({ dailyGoalMin: n }), [update]);

  const setTextScale = useCallback(
    (scale: TextScale) => {
      update({ textScale: scale });
      applyTextScale(scale);
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

  const setTimerMode = useCallback(
    (mode: TimerMode) => {
      update({ timerMode: mode });
      onTimerModeChange?.(mode);
    },
    [onTimerModeChange, update],
  );

  const pickTheme = useCallback(
    (id: ThemeId) => {
      onThemeChange(id);
      try {
        window.localStorage.setItem(THEME_KEY, id);
      } catch {
        /* ignore */
      }
    },
    [onThemeChange],
  );

  const localeOptions = useMemo(
    () =>
      LOCALES.map((l) => ({
        value: l,
        label: l === 'ru' ? t('common.lang.ru') : t('common.lang.en'),
      })),
    [t],
  );

  const textScaleOptions = useMemo(
    () =>
      TEXT_SCALES.map((scale) => ({
        value: scale,
        label:
          scale === 'normal'
            ? t('nordly.settings.text_scale.normal')
            : scale === 'large'
              ? t('nordly.settings.text_scale.large')
              : t('nordly.settings.text_scale.xlarge'),
      })),
    [t],
  );

  const boardCanvasOptions = useMemo(
    () => [
      { value: 'dark' as const, label: t('nordly.settings.board_canvas.dark') },
      { value: 'light' as const, label: t('nordly.settings.board_canvas.light') },
    ],
    [t],
  );

  const timerModeOptions = useMemo(
    () => [
      { value: 'pomodoro' as const, label: t('nordly.settings.timer_mode.pomodoro') },
      { value: 'stopwatch' as const, label: t('nordly.settings.timer_mode.stopwatch') },
    ],
    [t],
  );

  const tz = localTimeZone();

  return (
    <>
      <SettingsBlock title={t('nordly.settings.section.appearance')}>
        <SettingRow
          label={t('nordly.settings.wallpaper.label')}
          hint={t('nordly.settings.wallpaper.row_hint', { name: t(themeLabelKey(theme)) })}
        >
          <button
            type="button"
            className="nordly-settings-change-btn focus-ring"
            onClick={() => setCarouselOpen(true)}
          >
            {t('nordly.settings.wallpaper.change')}
          </button>
        </SettingRow>

        <SettingRow label={t('nordly.settings.language.label')} hint={t('nordly.settings.language.hint')}>
          <SegmentedControl
            ariaLabel={t('nordly.settings.language.label')}
            value={locale}
            options={localeOptions}
            onChange={setLocale}
          />
        </SettingRow>

        <SettingRow label={t('nordly.settings.text_scale.label')} hint={t('nordly.settings.text_scale.hint')}>
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

      <SettingsBlock title={t('nordly.settings.section.timer')}>
        <SettingRow label={t('nordly.settings.timer_mode.label')} hint={t('nordly.settings.timer_mode.hint')}>
          <SegmentedControl
            ariaLabel={t('nordly.settings.timer_mode.label')}
            value={settings.timerMode}
            options={timerModeOptions}
            onChange={setTimerMode}
          />
        </SettingRow>

        <SettingRow label={t('nordly.settings.pomodoro.label')} hint={t('nordly.settings.pomodoro.hint')}>
          <Slider
            min={5}
            max={90}
            step={5}
            value={settings.pomodoroMinutes}
            onChange={setPomo}
            unit={t('nordly.settings.pomodoro.unit')}
          />
        </SettingRow>

        <SettingRow label={t('nordly.settings.daily_goal.label')} hint={t('nordly.settings.daily_goal.hint')}>
          <Slider
            min={15}
            max={480}
            step={15}
            value={settings.dailyGoalMin}
            onChange={setDailyGoal}
            unit={t('nordly.settings.pomodoro.unit')}
          />
        </SettingRow>

        <SettingRow label={t('nordly.settings.end_bell.label')} hint={t('nordly.settings.end_bell.hint')}>
          <Toggle
            value={settings.endBell}
            onChange={(b) => update({ endBell: b })}
            label={settings.endBell ? t('nordly.settings.notifications.on') : t('nordly.settings.notifications.off')}
          />
        </SettingRow>

        <SettingRow label={t('nordly.settings.notifications.label')} hint={t('nordly.settings.notifications.hint')}>
          <Toggle
            value={settings.notifications}
            onChange={(b) => update({ notifications: b })}
            label={
              settings.notifications
                ? t('nordly.settings.notifications.on')
                : t('nordly.settings.notifications.off')
            }
          />
        </SettingRow>

        <SettingRow
          label={t('nordly.settings.calendar_notifications.label')}
          hint={t('nordly.settings.calendar_notifications.hint')}
        >
          <Toggle
            value={settings.calendarNotifications}
            onChange={(b) => update({ calendarNotifications: b })}
            label={
              settings.calendarNotifications
                ? t('nordly.settings.notifications.on')
                : t('nordly.settings.notifications.off')
            }
          />
        </SettingRow>
      </SettingsBlock>

      <SettingsBlock title={t('nordly.settings.section.rollover')}>
        <SettingRow
          label={t('nordly.settings.rollover.label')}
          hint={t('nordly.settings.rollover.hint')}
        >
          <div className="nordly-settings-rollover-control">
            <Toggle
              value={settings.taskRollover}
              onChange={(b) => update({ taskRollover: b })}
              label={
                settings.taskRollover
                  ? t('nordly.settings.notifications.on')
                  : t('nordly.settings.notifications.off')
              }
            />
            {tz ? (
              <span className="mono nordly-settings-rollover-tz">
                {t('nordly.settings.rollover.timezone', { tz })}
              </span>
            ) : null}
          </div>
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
