import { describe, expect, it } from 'vitest';

import type { TaskCard } from '@features/tasks/api/tasks';
import { TaskKind, TaskStatus } from '@features/tasks/model/status';
import { scheduleStartISO } from '@shared/lib/dates';

import { resolveTaskDurationSchedule } from '../taskScheduling';

function task(
  id: string,
  start: Date,
  scheduledDurationMin = 30,
): TaskCard {
  return {
    id,
    status: TaskStatus.Todo,
    kind: TaskKind.Custom,
    title: id,
    createdAt: '2026-08-01T08:00:00.000Z',
    updatedAt: '2026-08-01T08:00:00.000Z',
    scheduledStart: scheduleStartISO(start),
    scheduledDurationMin,
  };
}

describe('resolveTaskDurationSchedule', () => {
  it("checks collisions on the task's actual day", () => {
    const taskDay = new Date(2026, 7, 29, 9, 0);
    const edited = task('edited', taskDay);
    const blocker = task('blocker', taskDay);

    const resolved = resolveTaskDurationSchedule(
      edited,
      [edited, blocker],
      '2026-08-27',
      60,
    );

    expect(resolved.dayKey).toBe('2026-08-29');
    expect(resolved.start.getHours()).toBe(9);
    expect(resolved.start.getMinutes()).toBe(30);
    expect(resolved.durationMin).toBe(60);
  });
});
