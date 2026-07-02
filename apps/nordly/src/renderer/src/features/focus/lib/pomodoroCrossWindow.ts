import { emit, listen } from '@tauri-apps/api/event';

import { isTauriRuntime } from '@platform/runtime';
import {
  usePomodoroStore,
  type FocusTimerMode,
} from '@shared/model/pomodoro';

const SYNC_EVENT = 'pomodoro:sync';
const CMD_EVENT = 'pomodoro:cmd';
export const POMODORO_EXPIRED_EVENT = 'pomodoro:expired';

export interface PomodoroSyncPayload {
  mode: FocusTimerMode;
  remain: number;
  elapsed: number;
  running: boolean;
  durationSec: number;
}

export type PomodoroCmdAction = 'toggle' | 'reset';

function snapshot(): PomodoroSyncPayload {
  const s = usePomodoroStore.getState();
  return {
    mode: s.mode,
    remain: s.remain,
    elapsed: s.elapsed,
    running: s.running,
    durationSec: s.durationSec,
  };
}

function applyPayload(payload: PomodoroSyncPayload): void {
  const valueSec = payload.mode === 'pomodoro' ? payload.remain : payload.elapsed;
  usePomodoroStore.getState().hydrate(valueSec, payload.running, payload.mode);
  if (payload.durationSec !== usePomodoroStore.getState().durationSec) {
    usePomodoroStore.getState().setDurationSec(payload.durationSec);
  }
}

let syncing = false;

/** Main window: broadcast timer state and handle remote commands from the tray popover. */
export function initPomodoroLeader(): () => void {
  if (!isTauriRuntime()) return () => undefined;

  const unsubs: Array<() => void> = [];

  void listen<{ action: PomodoroCmdAction }>(CMD_EVENT, ({ payload }) => {
    const store = usePomodoroStore.getState();
    if (payload.action === 'toggle') store.toggle();
    else if (payload.action === 'reset') store.reset();
  }).then((off) => unsubs.push(off));

  const unsubStore = usePomodoroStore.subscribe((state, prev) => {
    if (syncing) return;
    if (
      state.remain === prev.remain &&
      state.elapsed === prev.elapsed &&
      state.running === prev.running &&
      state.mode === prev.mode &&
      state.durationSec === prev.durationSec
    ) {
      return;
    }
    void emit(SYNC_EVENT, snapshot());
  });
  unsubs.push(unsubStore);

  void emit(SYNC_EVENT, snapshot());

  return () => {
    for (const off of unsubs) off();
  };
}

/** Tray popover: mirror timer state and send play/pause commands to the main window. */
export function initPomodoroFollower(): () => void {
  if (!isTauriRuntime()) return () => undefined;

  const unsubs: Array<() => void> = [];

  void listen<PomodoroSyncPayload>(SYNC_EVENT, ({ payload }) => {
    syncing = true;
    applyPayload(payload);
    syncing = false;
  }).then((off) => unsubs.push(off));

  const bridge = window.nordly;
  if (bridge) {
    void bridge.pomodoro.load().then((snap) => {
      if (!snap) return;
      const mode: FocusTimerMode = snap.mode === 'stopwatch' ? 'stopwatch' : 'pomodoro';
      const elapsedMs = Date.now() - snap.savedAt;
      if (mode === 'pomodoro') {
        if (snap.running && elapsedMs >= snap.remainSec * 1000) {
          applyPayload({
            mode,
            remain: 0,
            elapsed: 0,
            running: false,
            durationSec: usePomodoroStore.getState().durationSec,
          });
          void emit(POMODORO_EXPIRED_EVENT, {});
          return;
        }
        const adjusted = snap.running
          ? Math.max(0, snap.remainSec - Math.floor(elapsedMs / 1000))
          : snap.remainSec;
        applyPayload({
          mode,
          remain: adjusted,
          elapsed: 0,
          running: snap.running,
          durationSec: usePomodoroStore.getState().durationSec,
        });
        return;
      }
      const adjusted = snap.running
        ? Math.max(0, snap.remainSec + Math.floor(elapsedMs / 1000))
        : snap.remainSec;
      applyPayload({
        mode,
        remain: 0,
        elapsed: adjusted,
        running: snap.running,
        durationSec: usePomodoroStore.getState().durationSec,
      });
    });
  }

  return () => {
    for (const off of unsubs) off();
  };
}

export function sendPomodoroCommand(action: PomodoroCmdAction): void {
  if (!isTauriRuntime()) {
    const store = usePomodoroStore.getState();
    if (action === 'toggle') store.toggle();
    else store.reset();
    return;
  }
  void emit(CMD_EVENT, { action });
}

export function formatTimerDigits(totalSec: number): string {
  const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const ss = String(totalSec % 60).padStart(2, '0');
  return `${mm[0]!} ${mm[1]!} : ${ss[0]!} ${ss[1]!}`;
}
