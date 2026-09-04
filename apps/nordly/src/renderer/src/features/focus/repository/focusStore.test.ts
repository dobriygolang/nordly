import { describe, expect, it } from 'vitest';

import {
  sameFocusSessions,
  type StoredFocusSession,
} from '@features/focus/repository/focusStore';

const SESSION: StoredFocusSession = {
  userId: 'user-1',
  id: 'session-1',
  key: 'user-1::session-1',
  planItemId: 'task-1',
  pinnedTitle: 'Deep work',
  startedAt: '2026-08-27T09:00:00.000Z',
  endedAt: '2026-08-27T09:30:00.000Z',
  pomodorosCompleted: 1,
  secondsFocused: 1_800,
  mode: 'pomodoro',
};

describe('sameFocusSessions', () => {
  it.each([
    { pinnedTitle: 'Updated title' },
    { startedAt: '2026-08-27T09:01:00.000Z' },
    { mode: 'stopwatch' as const },
    { synced: true },
  ])('detects a changed session field', (patch) => {
    expect(sameFocusSessions([SESSION], [{ ...SESSION, ...patch }])).toBe(false);
  });
});
