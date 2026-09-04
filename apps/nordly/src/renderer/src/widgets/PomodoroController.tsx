import { useCallback, useEffect, useRef } from 'react';

import {
  applyPersistedSnapshot,
  completePomodoroTimer,
  finishFocusSession,
  FocusSessionTransitionQueue,
  shouldApplyPersistedSnapshot,
} from '@features/focus/lib/pomodoroSession';
import {
  POMODORO_EXPIRED_EVENT,
  type PomodoroExpiredPayload,
} from '@features/focus/lib/pomodoroCrossWindow';
import { isTauriRuntime } from '@platform/runtime';
import { startFocusSession } from '@features/focus/api/focusClient';
import {
  createLatestOnlyWriter,
  type LatestOnlyWriter,
} from '@shared/lib/latestOnlyWriter';
import { listenEffect } from '@shared/lib/tauriListen';
import { usePomodoroStore, type FocusTimerMode } from '@shared/model/pomodoro';
import { TimerMode } from '@shared/model/settings';

function timerValueSec(mode: FocusTimerMode, remain: number, elapsed: number): number {
  return mode === TimerMode.Pomodoro ? remain : elapsed;
}

interface TimerVersionState {
  mode: FocusTimerMode;
  remain: number;
  elapsed: number;
  running: boolean;
  durationSec: number;
  pinnedTitle: string | null;
  pinnedPlanItemId: string | null;
  resetToken: number;
}

interface PendingPomodoroSave {
  snapshot: {
    remainSec: number;
    running: boolean;
    savedAt: number;
    mode: FocusTimerMode;
  };
  version: number;
}

function isRegularClockTick(state: TimerVersionState, prev: TimerVersionState): boolean {
  if (
    !state.running ||
    !prev.running ||
    state.mode !== prev.mode ||
    state.durationSec !== prev.durationSec ||
    state.pinnedTitle !== prev.pinnedTitle ||
    state.pinnedPlanItemId !== prev.pinnedPlanItemId ||
    state.resetToken !== prev.resetToken
  ) {
    return false;
  }
  if (state.mode === TimerMode.Pomodoro) {
    return state.remain === prev.remain - 1 && state.elapsed === prev.elapsed;
  }
  return state.elapsed === prev.elapsed + 1 && state.remain === prev.remain;
}

function reportPomodoroError(err: unknown): void {
  console.error('[nordly:pomodoro]', err);
}

/** Side effects for the dock timer — keeps App shell off the 1 Hz render path. */
export function PomodoroController(): null {
  const sessionRef = useRef<string | null>(null);
  const lastSavedRef = useRef(0);
  const sessionTransitionQueueRef = useRef(new FocusSessionTransitionQueue());
  const snapshotLoadRef = useRef<Promise<void> | null>(null);
  const applyingSnapshotRef = useRef(false);
  const stateVersionRef = useRef(0);
  const lastMutationAtRef = useRef(0);
  const knownPersistedVersionRef = useRef<{ savedAt: number; version: number } | null>(
    null,
  );
  const snapshotWriterRef = useRef<LatestOnlyWriter<PendingPomodoroSave> | null>(
    null,
  );

  const snapshotWriter = useCallback(
    (bridge: NonNullable<Window['nordly']>): LatestOnlyWriter<PendingPomodoroSave> => {
      if (!snapshotWriterRef.current) {
        snapshotWriterRef.current = createLatestOnlyWriter({
          write: ({ snapshot }) => bridge.pomodoro.save(snapshot),
          onSaved: ({ snapshot, version }) => {
            knownPersistedVersionRef.current = {
              savedAt: snapshot.savedAt,
              version,
            };
          },
          onError: reportPomodoroError,
        });
      }
      return snapshotWriterRef.current;
    },
    [],
  );

  const queueSessionTransition = useCallback(
    (transition: () => Promise<void>): Promise<void> =>
      sessionTransitionQueueRef.current.enqueue(transition),
    [],
  );

  const completeSession = useCallback(
    (durationSec: number): Promise<void> =>
      queueSessionTransition(() =>
        completePomodoroTimer(sessionRef, durationSec),
      ),
    [queueSessionTransition],
  );

  const finishSession = useCallback(
    (
      secondsFocused: number,
      pomodorosCompleted: number,
    ): Promise<void> =>
      queueSessionTransition(() =>
        finishFocusSession(sessionRef, {
          secondsFocused,
          pomodorosCompleted,
        }),
      ),
    [queueSessionTransition],
  );

  const startSession = useCallback(
    (
      planItemId: string | null,
      pinnedTitle: string | null,
      mode: FocusTimerMode,
    ): Promise<void> =>
      queueSessionTransition(async () => {
        if (sessionRef.current) return;
        const session = await startFocusSession({
          planItemId: planItemId ?? undefined,
          pinnedTitle: pinnedTitle ?? undefined,
          mode,
        });
        sessionRef.current = session.id;
      }),
    [queueSessionTransition],
  );

  const loadPersistedSnapshot = useCallback((): Promise<void> => {
    if (snapshotLoadRef.current) return snapshotLoadRef.current;
    const requestedAtVersion = stateVersionRef.current;
    const pending = (async () => {
      const bridge = typeof window !== 'undefined' ? window.nordly : undefined;
      if (!bridge) return;
      const snap = await bridge.pomodoro.load();
      if (!snap) return;
      if (
        !shouldApplyPersistedSnapshot(snap, {
          requestedAtVersion,
          currentVersion: stateVersionRef.current,
          lastMutationAt: lastMutationAtRef.current,
          knownPersistedVersion: knownPersistedVersionRef.current ?? undefined,
        })
      ) {
        return;
      }
      applyingSnapshotRef.current = true;
      try {
        await applyPersistedSnapshot(snap, sessionRef);
      } finally {
        applyingSnapshotRef.current = false;
      }
    })();
    snapshotLoadRef.current = pending;
    const clear = () => {
      if (snapshotLoadRef.current === pending) snapshotLoadRef.current = null;
    };
    void pending.then(clear, clear);
    return pending;
  }, []);

  useEffect(() => {
    return usePomodoroStore.subscribe((state, prev) => {
      if (isRegularClockTick(state, prev)) return;
      stateVersionRef.current += 1;
      lastMutationAtRef.current = Date.now();
    });
  }, []);

  useEffect(() => {
    void loadPersistedSnapshot().catch(reportPomodoroError);
    let focusTimer: number | null = null;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (focusTimer !== null) window.clearTimeout(focusTimer);
      focusTimer = window.setTimeout(() => {
        focusTimer = null;
        void loadPersistedSnapshot().catch(reportPomodoroError);
      }, 2_000);
    };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      if (focusTimer !== null) window.clearTimeout(focusTimer);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loadPersistedSnapshot]);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    return listenEffect<PomodoroExpiredPayload>(POMODORO_EXPIRED_EVENT, ({ payload }) => {
      const known = knownPersistedVersionRef.current;
      if (
        payload.savedAt < lastMutationAtRef.current ||
        (known && payload.savedAt < known.savedAt)
      ) {
        return;
      }
      void completeSession(
        usePomodoroStore.getState().durationSec,
      ).catch(reportPomodoroError);
    });
  }, [completeSession]);

  useEffect(() => {
    let id: number | undefined;
    const syncInterval = () => {
      if (id !== undefined) window.clearInterval(id);
      id = undefined;
      if (usePomodoroStore.getState().running) {
        id = window.setInterval(() => usePomodoroStore.getState().tick(), 1000);
      }
    };
    syncInterval();
    const unsub = usePomodoroStore.subscribe((state, prev) => {
      if (state.running !== prev.running) syncInterval();
    });
    return () => {
      unsub();
      if (id !== undefined) window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    return usePomodoroStore.subscribe((state, prev) => {
      if (
        state.remain === prev.remain &&
        state.elapsed === prev.elapsed &&
        state.running === prev.running &&
        state.mode === prev.mode
      ) {
        return;
      }

      const bridge = typeof window !== 'undefined' ? window.nordly : undefined;
      if (!bridge) return;

      const now = Date.now();
      const value = timerValueSec(state.mode, state.remain, state.elapsed);
      if (
        now - lastSavedRef.current >= 5000 ||
        value === 0 ||
        state.running !== prev.running ||
        state.mode !== prev.mode
      ) {
        lastSavedRef.current = now;
        const writer = snapshotWriter(bridge);
        writer.update({
          snapshot: {
            remainSec: value,
            running: state.running,
            savedAt: now,
            mode: state.mode,
          },
          version: stateVersionRef.current,
        });
        void writer.flush();
      }

      if (!state.running) return;
    });
  }, [snapshotWriter]);

  useEffect(() => {
    return usePomodoroStore.subscribe((state, prev) => {
      if (applyingSnapshotRef.current) return;
      if (state.running && !prev.running) {
        void startSession(
          state.pinnedPlanItemId,
          state.pinnedTitle,
          state.mode,
        ).catch(reportPomodoroError);
        return;
      }
      if (!state.running && prev.running) {
        const secondsFocused =
          prev.mode === TimerMode.Pomodoro
            ? Math.max(0, prev.durationSec - prev.remain)
            : Math.max(0, prev.elapsed);
        const pomodorosCompleted =
          prev.mode === TimerMode.Pomodoro && prev.remain === 0 ? 1 : 0;
        void finishSession(secondsFocused, pomodorosCompleted).catch(
          reportPomodoroError,
        );
      }
    });
  }, [finishSession, startSession]);

  useEffect(() => {
    return usePomodoroStore.subscribe((state, prev) => {
      if (state.mode !== TimerMode.Pomodoro) return;
      if (!state.running || state.remain !== 0 || prev.remain === 0) return;
      void completeSession(state.durationSec).catch(reportPomodoroError);
    });
  }, [completeSession]);

  return null;
}
