import type { FocusTimerMode } from '@shared/model/pomodoro';
import { TimerMode } from '@shared/model/settings';

const MODE_TO_WIRE: Record<FocusTimerMode, string> = {
  [TimerMode.Pomodoro]: 'SESSION_MODE_POMODORO',
  [TimerMode.Stopwatch]: 'SESSION_MODE_STOPWATCH',
};

const MODE_FROM_WIRE: Record<string, FocusTimerMode> = {
  SESSION_MODE_POMODORO: TimerMode.Pomodoro,
  SESSION_MODE_STOPWATCH: TimerMode.Stopwatch,
};

export function focusModeToWire(mode: FocusTimerMode): string {
  return MODE_TO_WIRE[mode];
}

export function focusModeFromWire(raw: string): FocusTimerMode {
  const mode = MODE_FROM_WIRE[raw];
  if (!mode) throw new Error(`Invalid focus session response: bad mode ${raw}`);
  return mode;
}
