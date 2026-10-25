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
import { FlashcardsSettingsBlock } from './general/FlashcardsSettingsBlock';
import { TimerSettingsBlock } from './general/TimerSettingsBlock';

interface GeneralSectionProps {
  category?: 'general' | 'timer' | 'cards';
  theme: ThemeId;
  onThemeChange: (theme: ThemeId) => void;
  boardCanvas: BoardCanvasTheme;
  onBoardCanvasChange: (theme: BoardCanvasTheme) => void;
  onPomoChange?: (seconds: number) => void;
  onTimerModeChange?: (mode: TimerMode) => void;
}

export function GeneralSection({
  category = 'general',
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
      {category === 'general' && <AppearanceSettingsBlock
        settings={settings}
        update={update}
        theme={theme}
        onThemeChange={onThemeChange}
        boardCanvas={boardCanvas}
        onBoardCanvasChange={onBoardCanvasChange}
      />}
      {category === 'timer' && <><TimerSettingsBlock
        settings={settings}
        update={update}
        onPomodoroSecondsChange={onPomoChange}
        onTimerModeChange={onTimerModeChange}
      />
      <RolloverSettingsBlock settings={settings} update={update} />
      </>}
      {category === 'cards' && <FlashcardsSettingsBlock settings={settings} update={update} />}
    </>
  );
}
