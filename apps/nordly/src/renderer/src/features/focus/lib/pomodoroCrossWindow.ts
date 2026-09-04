import { emit, listen } from '@tauri-apps/api/event';

import { shouldApplyPersistedSnapshot } from '@features/focus/lib/pomodoroSession';
import { isTauriRuntime } from '@platform/runtime';
import { listenEffects } from '@shared/lib/tauriListen';
import {
  parseFocusTimerMode,
  usePomodoroStore,
  type FocusTimerMode,
} from '@shared/model/pomodoro';
import { TimerMode } from '@shared/model/settings';

const SYNC_EVENT = 'pomodoro:sync';
const CMD_EVENT = 'pomodoro:cmd';
export const POMODORO_EXPIRED_EVENT = 'pomodoro:expired';

export interface PomodoroSyncPayload {
  version: number;
  savedAt: number;
  mode: FocusTimerMode;
  remain: number;
  elapsed: number;
  running: boolean;
  durationSec: number;
}

export interface PomodoroExpiredPayload {
  version: number;
  savedAt: number;
}

export type PomodoroCmdAction = 'toggle' | 'reset';

let leaderVersion = 0;

function snapshot(): PomodoroSyncPayload {
  const s = usePomodoroStore.getState();
  return {
    version: leaderVersion,
    savedAt: Date.now(),
    mode: s.mode,
    remain: s.remain,
    elapsed: s.elapsed,
    running: s.running,
    durationSec: s.durationSec,
  };
}

function applyPayload(payload: PomodoroSyncPayload): void {
  const mode = parseFocusTimerMode(payload.mode);
  const valueSec =
    mode === TimerMode.Pomodoro ? payload.remain : payload.elapsed;
  usePomodoroStore.getState().hydrate(valueSec, payload.running, mode);
  if (payload.durationSec !== usePomodoroStore.getState().durationSec) {
    usePomodoroStore.getState().setDurationSec(payload.durationSec);
  }
}

let syncing = false;

/** Main window: broadcast timer state and handle remote commands from the tray popover. */
export function initPomodoroLeader(): () => void {
  if (!isTauriRuntime()) return () => undefined;

  const unsubs: Array<() => void> = [];
  let active = true;

  unsubs.push(
    listenEffects((track) => {
      track(
        listen<{ action: PomodoroCmdAction }>(CMD_EVENT, ({ payload }) => {
          if (!active) return;
          const store = usePomodoroStore.getState();
          if (payload.action === 'toggle') store.toggle();
          else if (payload.action === 'reset') store.reset();
        }),
      );
    }),
  );

  const unsubStore = usePomodoroStore.subscribe((state, prev) => {
    if (syncing) return;
    const tickOnly =
      state.running &&
      prev.running &&
      state.mode === prev.mode &&
      state.durationSec === prev.durationSec &&
      (state.mode === TimerMode.Pomodoro
        ? state.remain === prev.remain - 1 && state.elapsed === prev.elapsed
        : state.elapsed === prev.elapsed + 1 && state.remain === prev.remain);
    if (tickOnly) return;
    leaderVersion += 1;
    void emit(SYNC_EVENT, snapshot()).catch((error) => {
      console.error('[nordly:pomodoro] state broadcast failed', error);
    });
  });
  unsubs.push(unsubStore);

  void emit(SYNC_EVENT, snapshot()).catch((error) => {
    console.error('[nordly:pomodoro] initial state broadcast failed', error);
  });

  return () => {
    active = false;
    for (const off of unsubs) off();
  };
}

/** Tray popover: mirror timer state and send play/pause commands to the main window. */
export function initPomodoroFollower(): () => void {
  if (!isTauriRuntime()) return () => undefined;

  const unsubs: Array<() => void> = [];
  let tickId: number | null = null;
  let followerVersion = 0;
  let lastSyncAt = 0;
  let active = true;

  const syncLocalTick = (): void => {
    if (tickId !== null) window.clearInterval(tickId);
    tickId = null;
    if (usePomodoroStore.getState().running) {
      tickId = window.setInterval(() => usePomodoroStore.getState().tick(), 1000);
    }
  };

  unsubs.push(
    listenEffects((track) => {
      track(
        listen<PomodoroSyncPayload>(SYNC_EVENT, ({ payload }) => {
          if (!active) return;
          followerVersion = Math.max(followerVersion + 1, payload.version);
          lastSyncAt = payload.savedAt;
          syncing = true;
          try {
            applyPayload(payload);
          } finally {
            syncing = false;
          }
          syncLocalTick();
        }),
      );
    }),
  );

  const unsubRunning = usePomodoroStore.subscribe((state, prev) => {
    if (state.running !== prev.running) syncLocalTick();
  });
  unsubs.push(unsubRunning);

  const bridge = window.nordly;
  if (bridge) {
    const requestedAtVersion = followerVersion;
    void bridge.pomodoro
      .load()
      .then((snap) => {
        if (!active || !snap) return;
        if (
          !shouldApplyPersistedSnapshot(snap, {
            requestedAtVersion,
            currentVersion: followerVersion,
            lastMutationAt: lastSyncAt,
          })
        ) {
          return;
        }
        const mode = parseFocusTimerMode(snap.mode);
        const elapsedMs = Math.max(0, Date.now() - snap.savedAt);
        if (mode === TimerMode.Pomodoro) {
          if (snap.running && elapsedMs >= snap.remainSec * 1000) {
            applyPayload({
              version: followerVersion,
              savedAt: snap.savedAt,
              mode,
              remain: 0,
              elapsed: 0,
              running: false,
              durationSec: usePomodoroStore.getState().durationSec,
            });
            void emit(POMODORO_EXPIRED_EVENT, {
              version: followerVersion,
              savedAt: snap.savedAt,
            } satisfies PomodoroExpiredPayload).catch((error) => {
              console.error('[nordly:pomodoro] expiry broadcast failed', error);
            });
            syncLocalTick();
            return;
          }
          const adjusted = snap.running
            ? Math.max(0, snap.remainSec - Math.floor(elapsedMs / 1000))
            : snap.remainSec;
          applyPayload({
            version: followerVersion,
            savedAt: snap.savedAt,
            mode,
            remain: adjusted,
            elapsed: 0,
            running: snap.running,
            durationSec: usePomodoroStore.getState().durationSec,
          });
          syncLocalTick();
          return;
        }
        const adjusted = snap.running
          ? Math.max(0, snap.remainSec + Math.floor(elapsedMs / 1000))
          : snap.remainSec;
        applyPayload({
          version: followerVersion,
          savedAt: snap.savedAt,
          mode,
          remain: 0,
          elapsed: adjusted,
          running: snap.running,
          durationSec: usePomodoroStore.getState().durationSec,
        });
        syncLocalTick();
      })
      .catch((err: unknown) => {
        console.error('[pomodoro] snapshot hydrate failed', err);
      });
  }

  return () => {
    active = false;
    if (tickId !== null) window.clearInterval(tickId);
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
  void emit(CMD_EVENT, { action }).catch((error) => {
    console.error('[nordly:pomodoro] command broadcast failed', error);
  });
}

export function formatTimerDigits(totalSec: number): string {
  const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const ss = String(totalSec % 60).padStart(2, '0');
  return `${mm[0]!} ${mm[1]!} : ${ss[0]!} ${ss[1]!}`;
}
