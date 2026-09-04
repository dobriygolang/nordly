import { describe, expect, it } from 'vitest';

import type { StoredFocusSession } from '@features/focus/api/focusClient';
import { toDayKey } from '@shared/lib/dates';

import { focusSecondsTodayForTask } from '../useHomeTodayTasks';

function session(endedAt: string): StoredFocusSession {
  return {
    key: 'user-1::session-1',
    userId: 'user-1',
    id: 'session-1',
    planItemId: 'task-1',
    pinnedTitle: 'Task',
    startedAt: new Date(new Date(endedAt).getTime() - 60_000).toISOString(),
    endedAt,
    pomodorosCompleted: 0,
    secondsFocused: 60,
    mode: 'stopwatch',
  };
}

describe('focusSecondsTodayForTask', () => {
  it('groups completed focus by the local day instead of the ISO prefix', () => {
    const candidates = [
      '2026-07-16T00:30:00+14:00',
      '2026-07-15T23:30:00-12:00',
    ];
    const endedAt = candidates.find(
      (candidate) => toDayKey(new Date(candidate)) !== candidate.slice(0, 10),
    );
    expect(endedAt).toBeDefined();

    const localDay = toDayKey(new Date(endedAt!));
    expect(focusSecondsTodayForTask([session(endedAt!)], 'task-1', localDay)).toBe(60);
    expect(
      focusSecondsTodayForTask([session(endedAt!)], 'task-1', endedAt!.slice(0, 10)),
    ).toBe(0);
  });
});
