import { useCallback, useEffect, useRef, useState } from 'react';

import {
  applyPersistedSnapshot,
  completePomodoroTimer,
  finishFocusSession,
} from '@features/focus/lib/pomodoroSession';
import { POMODORO_EXPIRED_EVENT } from '@features/focus/lib/pomodoroCrossWindow';
import { isTauriRuntime } from '@platform/runtime';
import { startFocusSession } from '@features/focus/api/focusClient';
import { listenEffect } from '@shared/lib/tauriListen';
import { usePomodoroStore, type FocusTimerMode } from '@shared/model/pomodoro';

function timerValueSec(mode: FocusTimerMode, remain: number, elapsed: number): number {
  return mode === 'pomodoro' ? remain : elapsed;
}

/** Side effects for the dock timer — keeps App shell off the 1 Hz render path. */
export function PomodoroController(): null {
  const sessionRef = useRef<string | null>(null);
  const lastSavedRef = useRef(0);
  const startPromiseRef = useRef<Promise<void> | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const finishSession = useCallback(async () => {
    if (startPromiseRef.current) {
      try {
        await startPromiseRef.current;
      } catch {
        // Start failure already reported via setError; still try finish if a session exists.
      }
    }
    await finishFocusSession(sessionRef);
  }, []);

  const loadPersistedSnapshot = useCallback(async () => {
    const bridge = typeof window !== 'undefined' ? window.nordly : undefined;
    if (!bridge) return;
    const snap = await bridge.pomodoro.load();
    if (!snap) return;
    await applyPersistedSnapshot(snap, sessionRef);
  }, []);

  useEffect(() => {
    void loadPersistedSnapshot();
    let focusTimer: number | null = null;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (focusTimer !== null) window.clearTimeout(focusTimer);
      focusTimer = window.setTimeout(() => {
        focusTimer = null;
        void loadPersistedSnapshot();
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
    return listenEffect(POMODORO_EXPIRED_EVENT, () => {
      void completePomodoroTimer(sessionRef, usePomodoroStore.getState().durationSec);
    });
  }, []);

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
        void bridge.pomodoro.save({
          remainSec: value,
          running: state.running,
          savedAt: now,
          mode: state.mode,
        });
      }

      if (!state.running) return;
    });
  }, []);

  useEffect(() => {
    return usePomodoroStore.subscribe((state, prev) => {
      if (state.running && !prev.running && !sessionRef.current) {
        const pending = startFocusSession({
          planItemId: state.pinnedPlanItemId ?? undefined,
          pinnedTitle: state.pinnedTitle ?? undefined,
          mode: state.mode,
        })
          .then((s) => {
            sessionRef.current = s.id;
          })
          .catch((err: unknown) => {
            setError(err instanceof Error ? err : new Error(String(err)));
          });
        startPromiseRef.current = pending.finally(() => {
          if (startPromiseRef.current === pending) startPromiseRef.current = null;
        });
        return;
      }
      if (!state.running && prev.running) {
        void finishSession().catch((err: unknown) => setError(err instanceof Error ? err : new Error(String(err))));
      }
    });
  }, [finishSession]);

  useEffect(() => {
    return usePomodoroStore.subscribe((state, prev) => {
      if (state.mode !== 'pomodoro') return;
      if (!state.running || state.remain !== 0 || prev.remain === 0) return;
      void (async () => {
        if (startPromiseRef.current) {
          try {
            await startPromiseRef.current;
          } catch {
            // Start failure already reported; complete is a no-op without a session.
          }
        }
        await completePomodoroTimer(sessionRef, state.durationSec);
      })().catch((err: unknown) => setError(err instanceof Error ? err : new Error(String(err))));
    });
  }, []);

  if (error) throw error;

  return null;
};
