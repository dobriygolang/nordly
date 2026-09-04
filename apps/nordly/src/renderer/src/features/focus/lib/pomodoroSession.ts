import { translate } from '@nordly-i18n';

import {
  endFocusSession,
  getOpenFocusSession,
  startFocusSession,
} from '@features/focus/api/focusClient';
import { notify } from '@shared/api/notifications';
import { readEndBell, TimerMode } from '@shared/model/settings';
import { usePomodoroStore, type FocusTimerMode, parseFocusTimerMode } from '@shared/model/pomodoro';

export interface PomodoroPersistSnap {
  remainSec: number;
  running: boolean;
  savedAt: number;
  mode?: string;
}

export interface SessionRef {
  current: string | null;
}

export interface PomodoroSnapshotFreshness {
  requestedAtVersion: number;
  currentVersion: number;
  lastMutationAt: number;
  knownPersistedVersion?: {
    savedAt: number;
    version: number;
  };
}

interface FinishOverride {
  secondsFocused?: number;
  pomodorosCompleted?: number;
}

const completionBySessionRef = new WeakMap<SessionRef, Promise<void>>();

export class FocusSessionTransitionQueue {
  private tail: Promise<void> = Promise.resolve();

  enqueue(transition: () => Promise<void>): Promise<void> {
    const pending = this.tail.then(transition);
    this.tail = pending.then(
      () => undefined,
      () => undefined,
    );
    return pending;
  }
}

export function snapMode(snap: PomodoroPersistSnap): FocusTimerMode {
  return parseFocusTimerMode(snap.mode);
}

export function shouldApplyPersistedSnapshot(
  snap: Pick<PomodoroPersistSnap, 'savedAt'>,
  freshness: PomodoroSnapshotFreshness,
): boolean {
  if (freshness.requestedAtVersion !== freshness.currentVersion) return false;
  const known = freshness.knownPersistedVersion;
  if (known?.savedAt === snap.savedAt) {
    return known.version === freshness.currentVersion;
  }
  return snap.savedAt > freshness.lastMutationAt;
}

async function resolveSessionId(sessionRef: SessionRef): Promise<string | null> {
  if (sessionRef.current) return sessionRef.current;
  return (await getOpenFocusSession())?.id ?? null;
}

export async function finishFocusSession(
  sessionRef: SessionRef,
  override?: FinishOverride,
): Promise<void> {
  const { remain, durationSec, mode, elapsed } = usePomodoroStore.getState();
  const secondsFocused =
    override?.secondsFocused ??
    (mode === TimerMode.Pomodoro
      ? Math.max(0, durationSec - remain)
      : Math.max(0, elapsed));
  const pomodorosCompleted =
    override?.pomodorosCompleted ??
    (mode === TimerMode.Pomodoro && remain === 0 ? 1 : 0);

  const id = await resolveSessionId(sessionRef);
  if (!id) return;

  await endFocusSession({
    sessionId: id,
    pomodorosCompleted,
    secondsFocused,
    reflection: '',
  });
  if (sessionRef.current === id) sessionRef.current = null;
}

export async function reattachFocusSession(sessionRef: SessionRef): Promise<void> {
  if (sessionRef.current) return;
  const open = await getOpenFocusSession();
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

export function completePomodoroTimer(
  sessionRef: SessionRef,
  durationSec: number,
): Promise<void> {
  const active = completionBySessionRef.get(sessionRef);
  if (active) return active;

  const completion = (async () => {
    const id = await resolveSessionId(sessionRef);
    if (!id) {
      // Idempotent — timer already finished / session already closed.
      usePomodoroStore.getState().complete();
      return;
    }
    await finishFocusSession(sessionRef, {
      secondsFocused: durationSec,
      pomodorosCompleted: 1,
    });
    void notify(
      translate('nordly.notify.session_title'),
      translate('nordly.notify.session_body'),
      { sound: readEndBell() ? 'session' : false },
    ).catch((error: unknown) => {
      console.error('[nordly:pomodoro] completion notification failed', error);
    });
    usePomodoroStore.getState().complete();
  })();

  completionBySessionRef.set(sessionRef, completion);
  const clear = () => {
    if (completionBySessionRef.get(sessionRef) === completion) {
      completionBySessionRef.delete(sessionRef);
    }
  };
  void completion.then(clear, clear);
  return completion;
}

export async function applyPersistedSnapshot(
  snap: PomodoroPersistSnap,
  sessionRef: SessionRef,
): Promise<void> {
  const mode = snapMode(snap);
  const elapsedMs = Math.max(0, Date.now() - snap.savedAt);

  if (mode === TimerMode.Pomodoro) {
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
