import { useCallback, useState } from 'react';

import type { BoardCanvasTheme } from '@shared/lib/excalidraw/nordlyTheme';
import {
  patchSettings,
  readSettings,
  type NordlySettings,
  type TimerMode,
} from '@shared/model/settings';
import type { ThemeId } from '@shared/model/theme';
import { AppearanceSettingsBlock } from './general/AppearanceSettingsBlock';
import { RolloverSettingsBlock } from './general/RolloverSettingsBlock';
import { TimerSettingsBlock } from './general/TimerSettingsBlock';

interface GeneralSectionProps {
  theme: ThemeId;
  onThemeChange: (theme: ThemeId) => void;
  boardCanvas: BoardCanvasTheme;
  onBoardCanvasChange: (theme: BoardCanvasTheme) => void;
  onPomoChange?: (seconds: number) => void;
  onTimerModeChange?: (mode: TimerMode) => void;
}

export function GeneralSection({
  theme,
  onThemeChange,
  boardCanvas,
  onBoardCanvasChange,
  onPomoChange,
  onTimerModeChange,
}: GeneralSectionProps): JSX.Element {
  const [settings, setSettings] = useState<NordlySettings>(() => readSettings());
  const update = useCallback((patch: Partial<NordlySettings>) => {
    setSettings(patchSettings(patch));
  }, []);

  return (
    <>
      <AppearanceSettingsBlock
        settings={settings}
        update={update}
        theme={theme}
        onThemeChange={onThemeChange}
        boardCanvas={boardCanvas}
        onBoardCanvasChange={onBoardCanvasChange}
      />
      <TimerSettingsBlock
        settings={settings}
        update={update}
        onPomodoroSecondsChange={onPomoChange}
        onTimerModeChange={onTimerModeChange}
      />
      <RolloverSettingsBlock settings={settings} update={update} />
    </>
  );
}
