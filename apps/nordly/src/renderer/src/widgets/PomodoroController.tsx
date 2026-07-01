import { useCallback, useEffect, useRef } from 'react';

import { listen } from '@tauri-apps/api/event';

import {
  applyPersistedSnapshot,
  completePomodoroTimer,
  finishFocusSession,
  reattachFocusSession,
} from '@features/focus/lib/pomodoroSession';
import { POMODORO_EXPIRED_EVENT } from '@features/focus/lib/pomodoroCrossWindow';
import { startFocusSession } from '@features/focus/api/focusClient';
import { usePomodoroStore, type FocusTimerMode } from '@shared/model/pomodoro';

function timerValueSec(mode: FocusTimerMode, remain: number, elapsed: number): number {
  return mode === 'pomodoro' ? remain : elapsed;
}

/** Side effects for the dock timer — keeps App shell off the 1 Hz render path. */
export function PomodoroController(): null {
  const sessionRef = useRef<string | null>(null);
  const lastSavedRef = useRef(0);

  const finishSession = useCallback(async () => {
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
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      void loadPersistedSnapshot();
    };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loadPersistedSnapshot]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return;
    let unlisten: (() => void) | undefined;
    void listen(POMODORO_EXPIRED_EVENT, () => {
      void completePomodoroTimer(sessionRef, usePomodoroStore.getState().durationSec);
    }).then((off) => {
      unlisten = off;
    });
    return () => {
      unlisten?.();
    };
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
        void startFocusSession({
          planItemId: state.pinnedPlanItemId ?? undefined,
          pinnedTitle: state.pinnedTitle ?? undefined,
          mode: state.mode,
        })
          .then((s) => {
            sessionRef.current = s.id;
          })
          .catch(() => {
            void reattachFocusSession(sessionRef);
          });
        return;
      }
      if (!state.running && prev.running) {
        void finishSession();
      }
    });
  }, [finishSession]);

  useEffect(() => {
    return usePomodoroStore.subscribe((state, prev) => {
      if (state.mode !== 'pomodoro') return;
      if (!state.running || state.remain !== 0 || prev.remain === 0) return;
      void completePomodoroTimer(sessionRef, state.durationSec);
    });
  }, []);

  useEffect(() => {
    return usePomodoroStore.subscribe((state, prev) => {
      if (state.resetToken !== prev.resetToken) void finishSession();
    });
  }, [finishSession]);

  useEffect(() => {
    return usePomodoroStore.subscribe((state, prev) => {
      if (state.mode === prev.mode) return;
      void finishSession();
    });
  }, [finishSession]);

  return null;
};
