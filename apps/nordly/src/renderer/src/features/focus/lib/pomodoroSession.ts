import { translate } from '@nordly-i18n';

import { endFocusSession, startFocusSession } from '@features/focus/api/focusClient';
import { findOpenFocusSession } from '@features/focus/repository/focusStore';
import { notify } from '@shared/api/notifications';
import { readEndBell } from '@shared/model/settings';
import { usePomodoroStore, type FocusTimerMode } from '@shared/model/pomodoro';

export interface PomodoroPersistSnap {
  remainSec: number;
  running: boolean;
  savedAt: number;
  mode?: string;
}

export interface SessionRef {
  current: string | null;
}

interface FinishOverride {
  secondsFocused?: number;
  pomodorosCompleted?: number;
}

export function snapMode(snap: PomodoroPersistSnap): FocusTimerMode {
  return snap.mode === 'stopwatch' ? 'stopwatch' : 'pomodoro';
}

async function resolveSessionId(sessionRef: SessionRef): Promise<string | null> {
  if (sessionRef.current) return sessionRef.current;
  return (await findOpenFocusSession())?.id ?? null;
}

export async function finishFocusSession(
  sessionRef: SessionRef,
  override?: FinishOverride,
): Promise<void> {
  const { remain, durationSec, mode, elapsed } = usePomodoroStore.getState();
  const secondsFocused =
    override?.secondsFocused ??
    (mode === 'pomodoro' ? Math.max(0, durationSec - remain) : Math.max(0, elapsed));
  const pomodorosCompleted =
    override?.pomodorosCompleted ?? (mode === 'pomodoro' && remain === 0 ? 1 : 0);

  const id = await resolveSessionId(sessionRef);
  if (!id) return;

  sessionRef.current = null;
  await endFocusSession({
    sessionId: id,
    pomodorosCompleted,
    secondsFocused,
    reflection: '',
  });
}

export async function reattachFocusSession(sessionRef: SessionRef): Promise<void> {
  if (sessionRef.current) return;
  const open = await findOpenFocusSession();
  if (open) {
    sessionRef.current = open.id;
    return;
  }
  const { pinnedPlanItemId, pinnedTitle, mode } = usePomodoroStore.getState();
  const session = await startFocusSession({
    planItemId: pinnedPlanItemId ?? undefined,
    pinnedTitle: pinnedTitle ?? undefined,
    mode,
  });
  sessionRef.current = session.id;
}

export async function completePomodoroTimer(
  sessionRef: SessionRef,
  durationSec: number,
): Promise<void> {
  const id = await resolveSessionId(sessionRef);
  if (!id) {
    throw new Error('No focus session to complete');
  }
  await finishFocusSession(sessionRef, {
    secondsFocused: durationSec,
    pomodorosCompleted: 1,
  });
  void notify(
    translate('nordly.notify.session_title'),
    translate('nordly.notify.session_body'),
    { sound: readEndBell() ? 'session' : false },
  );
  usePomodoroStore.getState().complete();
}

export async function applyPersistedSnapshot(
  snap: PomodoroPersistSnap,
  sessionRef: SessionRef,
): Promise<void> {
  const mode = snapMode(snap);
  const elapsedMs = Math.max(0, Date.now() - snap.savedAt);

  if (mode === 'pomodoro') {
    if (snap.running && elapsedMs >= snap.remainSec * 1000) {
      usePomodoroStore.getState().hydrate(0, false, mode);
      await completePomodoroTimer(sessionRef, usePomodoroStore.getState().durationSec);
      return;
    }
    const adjusted = snap.running
      ? Math.max(0, snap.remainSec - Math.floor(elapsedMs / 1000))
      : snap.remainSec;
    usePomodoroStore.getState().hydrate(adjusted, snap.running, mode);
  } else {
    const adjusted = snap.running
      ? Math.max(0, snap.remainSec + Math.floor(elapsedMs / 1000))
      : snap.remainSec;
    usePomodoroStore.getState().hydrate(adjusted, snap.running, mode);
  }

  if (snap.running) {
    await reattachFocusSession(sessionRef);
  }
}
