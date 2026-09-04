import { create } from 'zustand';

import {
  TIMER_MODES,
  TimerMode,
  isTimerMode,
  readPomodoroSeconds,
  readTimerMode,
} from '@shared/model/settings';

export type FocusTimerMode = TimerMode;

/** Missing mode migrates once to pomodoro; unknown values throw. */
export function parseFocusTimerMode(mode: string | undefined | null): FocusTimerMode {
  if (mode === undefined || mode === null || mode === '') {
    console.warn('[pomodoro] snapshot missing mode; migrating to pomodoro');
    return TimerMode.Pomodoro;
  }
  if (isTimerMode(mode)) return mode;
  throw new Error(`Invalid pomodoro snapshot mode: ${mode}`);
}
export interface PomodoroStartArgs {
  planItemId?: string;
  pinnedTitle?: string;
}

interface PomodoroState {
  mode: FocusTimerMode;
  remain: number;
  elapsed: number;
  running: boolean;
  durationSec: number;
  pinnedTitle: string | null;
  pinnedPlanItemId: string | null;
  resetToken: number;
  setMode: (mode: FocusTimerMode) => void;
  cycleMode: () => void;
  setDurationSec: (sec: number) => void;
  hydrate: (valueSec: number, running: boolean, mode?: FocusTimerMode) => void;
  toggle: () => void;
  reset: () => void;
  start: (args?: PomodoroStartArgs) => void;
  tick: () => void;
  complete: () => void;
}

export const usePomodoroStore = create<PomodoroState>((set, get) => ({
  mode: readTimerMode(),
  remain: readPomodoroSeconds(),
  elapsed: 0,
  running: false,
  durationSec: readPomodoroSeconds(),
  pinnedTitle: null,
  pinnedPlanItemId: null,
  resetToken: 0,

  setMode: (mode) => {
    if (get().mode === mode) return;
    set((s) => ({
      mode,
      remain:
        mode === TimerMode.Pomodoro
          ? Math.max(
              0,
              s.durationSec -
                (s.mode === TimerMode.Stopwatch ? s.elapsed : s.durationSec - s.remain),
            )
          : s.remain,
      elapsed:
        mode === TimerMode.Stopwatch
          ? s.mode === TimerMode.Pomodoro
            ? Math.max(0, s.durationSec - s.remain)
            : s.elapsed
          : s.elapsed,
    }));
  },

  cycleMode: () => {
    const { mode } = get();
    const idx = TIMER_MODES.indexOf(mode);
    const next = TIMER_MODES[(idx + 1) % TIMER_MODES.length];
    if (!next) {
      throw new Error(`pomodoro.cycleMode: no next mode after ${mode}`);
    }
    get().setMode(next);
  },

  setDurationSec: (sec) => {
    const clamped = Math.max(60, sec);
    set({ durationSec: clamped });
    if (!get().running && get().mode === TimerMode.Pomodoro) set({ remain: clamped });
  },

  hydrate: (valueSec, running, mode) => {
    const nextMode = mode ?? get().mode;
    if (nextMode === TimerMode.Stopwatch) {
      set({ mode: nextMode, elapsed: Math.max(0, valueSec), running });
      return;
    }
    set({
      mode: nextMode,
      remain: Math.max(0, valueSec),
      running: running && valueSec > 0,
    });
  },

  toggle: () => {
    set((s) => ({ running: !s.running }));
  },

  reset: () => {
    set((s) => ({
      running: false,
      remain: s.durationSec,
      elapsed: 0,
      resetToken: s.resetToken + 1,
    }));
  },

  start: (args) => {
    const mode = get().mode;
    set({
      running: true,
      remain: mode === TimerMode.Pomodoro ? get().durationSec : get().remain,
      elapsed: mode === TimerMode.Stopwatch ? 0 : get().elapsed,
      pinnedPlanItemId: args?.planItemId ?? null,
      pinnedTitle: args?.pinnedTitle ?? null,
    });
  },

  tick: () => {
    const { running, mode, remain, elapsed } = get();
    if (!running) return;
    if (mode === TimerMode.Pomodoro) {
      if (remain <= 0) return;
      set({ remain: remain - 1 });
      return;
    }
    set({ elapsed: elapsed + 1 });
  },

  complete: () => {
    set({ running: false, remain: get().durationSec, elapsed: 0 });
  },
}));
