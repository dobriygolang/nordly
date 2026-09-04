import { useCallback, useMemo } from 'react';

import { useT } from '@nordly-i18n';

import {
  TimerMode,
  type NordlySettings,
} from '@shared/model/settings';
import { SegmentedControl } from '@shared/ui/primitives/SegmentedControl';
import { SettingRow, SettingsBlock } from '../../primitives/SettingRow';
import { Slider } from '../../primitives/Slider';
import { Toggle } from '../../primitives/Toggle';

interface TimerSettingsBlockProps {
  settings: NordlySettings;
  update: (patch: Partial<NordlySettings>) => void;
  onPomodoroSecondsChange?: (seconds: number) => void;
  onTimerModeChange?: (mode: TimerMode) => void;
}

export function TimerSettingsBlock({
  settings,
  update,
  onPomodoroSecondsChange,
  onTimerModeChange,
}: TimerSettingsBlockProps): JSX.Element {
  const t = useT();
  const timerModeOptions = useMemo(
    () => [
      {
        value: TimerMode.Pomodoro,
        label: t('nordly.settings.timer_mode.pomodoro'),
      },
      {
        value: TimerMode.Stopwatch,
        label: t('nordly.settings.timer_mode.stopwatch'),
      },
    ],
    [t],
  );

  const setPomodoroMinutes = useCallback(
    (pomodoroMinutes: number) => {
      update({ pomodoroMinutes });
      onPomodoroSecondsChange?.(pomodoroMinutes * 60);
    },
    [onPomodoroSecondsChange, update],
  );
  const setTimerMode = useCallback(
    (timerMode: TimerMode) => {
      update({ timerMode });
      onTimerModeChange?.(timerMode);
    },
    [onTimerModeChange, update],
  );

  return (
    <SettingsBlock title={t('nordly.settings.section.timer')}>
      <SettingRow
        label={t('nordly.settings.timer_mode.label')}
        hint={t('nordly.settings.timer_mode.hint')}
      >
        <SegmentedControl
          ariaLabel={t('nordly.settings.timer_mode.label')}
          value={settings.timerMode}
          options={timerModeOptions}
          onChange={setTimerMode}
        />
      </SettingRow>

      <SettingRow
        label={t('nordly.settings.pomodoro.label')}
        hint={t('nordly.settings.pomodoro.hint')}
      >
        <Slider
          min={5}
          max={90}
          step={5}
          value={settings.pomodoroMinutes}
          onChange={setPomodoroMinutes}
          unit={t('nordly.settings.pomodoro.unit')}
          label={t('nordly.settings.pomodoro.label')}
        />
      </SettingRow>

      <SettingRow
        label={t('nordly.settings.daily_goal.label')}
        hint={t('nordly.settings.daily_goal.hint')}
      >
        <Slider
          min={15}
          max={480}
          step={15}
          value={settings.dailyGoalMin}
          onChange={(dailyGoalMin) => update({ dailyGoalMin })}
          unit={t('nordly.settings.pomodoro.unit')}
          label={t('nordly.settings.daily_goal.label')}
        />
      </SettingRow>

      <SettingRow
        label={t('nordly.settings.end_bell.label')}
        hint={t('nordly.settings.end_bell.hint')}
      >
        <Toggle
          value={settings.endBell}
          onChange={(endBell) => update({ endBell })}
          label={
            settings.endBell
              ? t('nordly.settings.notifications.on')
              : t('nordly.settings.notifications.off')
          }
        />
      </SettingRow>

      <SettingRow
        label={t('nordly.settings.notifications.label')}
        hint={t('nordly.settings.notifications.hint')}
      >
        <Toggle
          value={settings.notifications}
          onChange={(notifications) => update({ notifications })}
          label={
            settings.notifications
              ? t('nordly.settings.notifications.on')
              : t('nordly.settings.notifications.off')
          }
        />
      </SettingRow>

      <SettingRow
        label={t('nordly.settings.notification_volume.label')}
        hint={t('nordly.settings.notification_volume.hint')}
      >
        <Slider
          min={0}
          max={100}
          step={5}
          value={settings.notificationVolume}
          onChange={(notificationVolume) => update({ notificationVolume })}
          unit="%"
          label={t('nordly.settings.notification_volume.label')}
        />
      </SettingRow>

      <SettingRow
        label={t('nordly.settings.calendar_notifications.label')}
        hint={t('nordly.settings.calendar_notifications.hint')}
      >
        <Toggle
          value={settings.calendarNotifications}
          onChange={(calendarNotifications) => update({ calendarNotifications })}
          label={
            settings.calendarNotifications
              ? t('nordly.settings.notifications.on')
              : t('nordly.settings.notifications.off')
          }
        />
      </SettingRow>

      <SettingRow
        label={t('nordly.settings.task_notifications.label')}
        hint={t('nordly.settings.task_notifications.hint')}
      >
        <Toggle
          value={settings.taskNotifications}
          onChange={(taskNotifications) => update({ taskNotifications })}
          label={
            settings.taskNotifications
              ? t('nordly.settings.notifications.on')
              : t('nordly.settings.notifications.off')
          }
        />
      </SettingRow>
    </SettingsBlock>
  );
}
