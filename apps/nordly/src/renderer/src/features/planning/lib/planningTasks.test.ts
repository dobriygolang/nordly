import { beforeEach, describe, expect, it } from 'vitest';

import type { TaskCard } from '@features/tasks/api/tasks';
import { TaskKind, TaskStatus } from '@features/tasks/model/status';
import { scheduleStartISO } from '@shared/lib/dates';
import { patchSettings } from '@shared/model/settings';

import {
  buildPlanningPool,
  findPlanningDayKey,
  nextWeekStartKey,
  planningColumnKeys,
  PLANNING_POOL_DAY_KEY,
  tomorrowKey,
  weekWindowEndKey,
} from './planningTasks';

/** Wednesday 2026-07-29 — mid-week, so the current-week window is neither empty nor full. */
const TODAY = '2026-07-29';

function task(id: string, dayKey: string, extra: Partial<TaskCard> = {}): TaskCard {
  const [y, m, d] = dayKey.split('-').map(Number);
  return {
    id,
    status: TaskStatus.Todo,
    kind: TaskKind.Custom,
    title: id,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    scheduledStart: scheduleStartISO(new Date(y, m - 1, d, 9, 0)),
    scheduledDurationMin: 30,
    ...extra,
  };
}

function ids(tasks: TaskCard[]): string[] {
  return tasks.map((t) => t.id);
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('week helpers', () => {
  it('ends the window on Sunday and starts next week on Monday by default', () => {
    expect(weekWindowEndKey(TODAY)).toBe('2026-08-02');
    expect(weekWindowEndKey(TODAY, 1)).toBe('2026-08-09');
    expect(nextWeekStartKey(TODAY)).toBe('2026-08-03');
    expect(tomorrowKey(TODAY)).toBe('2026-07-30');
  });

  it('follows the week-starts-on setting', () => {
    patchSettings({ weekStartsOn: 'sunday' });
    expect(weekWindowEndKey(TODAY)).toBe('2026-08-01');
    expect(nextWeekStartKey(TODAY)).toBe('2026-08-02');
  });
});

describe('buildPlanningPool', () => {
  const opts = { poolAbsorbsNearDays: true };

  it('keeps the current week and hides later tasks behind a count', () => {
    const pool = buildPlanningPool(
      [
        task('thu', '2026-07-30'),
        task('sat', '2026-08-01'),
        task('next-mon', '2026-08-03'),
        task('far', '2026-09-15'),
      ],
      TODAY,
      opts,
    );

    expect(ids(pool.tasks)).toEqual(['thu', 'sat']);
    expect(pool.windowEndKey).toBe('2026-08-02');
    expect(pool.hiddenCount).toBe(2);
    expect(pool.nextHiddenKey).toBe('2026-08-03');
  });

  it('orders strictly by day, ignoring the within-day `order` index', () => {
    const pool = buildPlanningPool(
      [
        task('fri', '2026-07-31', { order: 0 }),
        task('thu', '2026-07-30', { order: 7 }),
      ],
      TODAY,
      opts,
    );

    expect(ids(pool.tasks)).toEqual(['thu', 'fri']);
  });

  it('puts overdue tasks first, oldest to newest', () => {
    const pool = buildPlanningPool(
      [task('thu', '2026-07-30'), task('late', '2026-07-20'), task('later', '2026-07-27')],
      TODAY,
      opts,
    );

    expect(ids(pool.tasks)).toEqual(['late', 'later', 'thu']);
    expect(pool.overdueCount).toBe(2);
  });

  it('rolls the window forward whole weeks when the current week is empty', () => {
    const pool = buildPlanningPool(
      [task('mid-aug', '2026-08-12'), task('late-aug', '2026-08-14')],
      TODAY,
      opts,
    );

    expect(ids(pool.tasks)).toEqual(['mid-aug', 'late-aug']);
    expect(pool.windowEndKey).toBe('2026-08-16');
    expect(pool.weeksAhead).toBe(2);
    expect(pool.hiddenCount).toBe(0);
  });

  it('never interleaves weeks when rolling forward', () => {
    const pool = buildPlanningPool(
      [task('next-week', '2026-08-05'), task('week-after', '2026-08-12')],
      TODAY,
      opts,
    );

    expect(ids(pool.tasks)).toEqual(['next-week']);
    expect(pool.nextHiddenKey).toBe('2026-08-12');
  });

  it('extends by explicit weeks on request', () => {
    const tasks = [task('next-week', '2026-08-05'), task('week-after', '2026-08-12')];
    const pool = buildPlanningPool(tasks, TODAY, { ...opts, extraWeeks: 2 });

    expect(ids(pool.tasks)).toEqual(['next-week', 'week-after']);
    expect(pool.hiddenCount).toBe(0);
  });

  it('excludes today, done tasks and dateless tasks', () => {
    const pool = buildPlanningPool(
      [
        task('today', TODAY),
        task('done', '2026-07-30', { status: TaskStatus.Done }),
        task('dismissed', '2026-07-31', { status: TaskStatus.Dismissed }),
        task('dateless', '2026-07-30', { scheduledStart: undefined }),
        task('thu', '2026-07-30'),
      ],
      TODAY,
      opts,
    );

    expect(ids(pool.tasks)).toEqual(['thu']);
  });

  it('absorbs tomorrow and next week on Pick, but leaves them out on Defer', () => {
    const tasks = [task('tomorrow', '2026-07-30'), task('next-mon', '2026-08-03')];

    expect(ids(buildPlanningPool(tasks, TODAY, { poolAbsorbsNearDays: true }).tasks)).toEqual([
      'tomorrow',
    ]);
    expect(ids(buildPlanningPool(tasks, TODAY, { poolAbsorbsNearDays: false }).tasks)).toEqual([]);
  });

  it('does not create an invisible pool target during Defer', () => {
    const farTask = task('far', '2026-08-12');

    expect(planningColumnKeys(TODAY, false)).toEqual([
      TODAY,
      tomorrowKey(TODAY),
      nextWeekStartKey(TODAY),
    ]);
    expect(planningColumnKeys(TODAY, false)).not.toContain(PLANNING_POOL_DAY_KEY);
    expect(findPlanningDayKey(farTask, TODAY, false)).toBeNull();
    expect(findPlanningDayKey(farTask, TODAY, true)).toBe(
      PLANNING_POOL_DAY_KEY,
    );
  });
});
