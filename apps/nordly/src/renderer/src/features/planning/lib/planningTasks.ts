import type { TaskCard } from '@features/tasks/api/tasks';
import {
  addDays,
  defaultDurationMin,
  parseDayKey,
  startOfLocalDay,
  sumDurationMin,
  taskDayKey,
  taskScheduleStart,
  toDayKey,
} from '@shared/lib/dates';
import { startOfLocaleWeek } from '@shared/lib/localeFormat';

/** Synthetic day key for the "all other tasks" pool column — not a real schedule target. */
export const PLANNING_POOL_DAY_KEY = '__planning_pool__';

export const VISIBLE_TASK_STATUSES = new Set<TaskCard['status']>([
  'todo',
  'in_progress',
  'in_review',
  'done',
]);

export function taskColumnKey(task: TaskCard, todayKey: string): string {
  if (!task.scheduledStart) return todayKey;
  return taskDayKey(task);
}

export function isVisibleTask(task: TaskCard): boolean {
  return VISIBLE_TASK_STATUSES.has(task.status);
}

export function tasksForToday(tasks: TaskCard[], todayKey: string): TaskCard[] {
  return tasks
    .filter(isVisibleTask)
    .filter((task) => taskColumnKey(task, todayKey) === todayKey)
    .sort(sortPlanningTasks);
}

/** Order inside a real day column: unfinished first, then the manual `order` index. */
function sortPlanningTasks(a: TaskCard, b: TaskCard): number {
  const aDone = a.status === 'done' ? 1 : 0;
  const bDone = b.status === 'done' ? 1 : 0;
  if (aDone !== bDone) return aDone - bDone;
  const aOrder = a.order ?? taskScheduleStart(a)?.getTime() ?? new Date(a.createdAt).getTime();
  const bOrder = b.order ?? taskScheduleStart(b)?.getTime() ?? new Date(b.createdAt).getTime();
  return aOrder - bOrder;
}

/**
 * Chronological order for the cross-day pool.
 *
 * `order` must not participate here: it is a dense within-day index, so a task that
 * was ever dragged carries `order` 0..n while an untouched one falls back to an epoch
 * timestamp — mixing the two floated every dragged task above every other day and let
 * a Friday task outrank a Monday one.
 */
function compareByScheduleAsc(a: TaskCard, b: TaskCard): number {
  const at = taskScheduleStart(a)?.getTime() ?? 0;
  const bt = taskScheduleStart(b)?.getTime() ?? 0;
  if (at !== bt) return at - bt;
  return a.title.localeCompare(b.title);
}

export function findPlanningDayKey(
  task: TaskCard,
  todayKey: string,
  poolAbsorbsNearDays = false,
): string {
  if (!task.scheduledStart) return todayKey;
  const key = taskDayKey(task);
  if (key === todayKey) return todayKey;
  if (poolAbsorbsNearDays) return PLANNING_POOL_DAY_KEY;
  if (key === tomorrowKey(todayKey)) return key;
  if (key === nextWeekStartKey(todayKey)) return key;
  return PLANNING_POOL_DAY_KEY;
}

/** Start of the week after the one holding `from`, honouring Settings → week starts on. */
export function nextWeekStart(from = new Date()): Date {
  return addDays(startOfLocaleWeek(startOfLocalDay(from)), 7);
}

export function tomorrowKey(todayKey: string): string {
  return toDayKey(addDays(parseDayKey(todayKey), 1));
}

export function nextWeekStartKey(todayKey: string): string {
  return toDayKey(nextWeekStart(parseDayKey(todayKey)));
}

/** Last day (inclusive) of the week `weeksAhead` weeks after the one holding `todayKey`. */
export function weekWindowEndKey(todayKey: string, weeksAhead = 0): string {
  const weekStart = startOfLocaleWeek(parseDayKey(todayKey));
  return toDayKey(addDays(weekStart, 7 * (weeksAhead + 1) - 1));
}

export interface PlanningPool {
  /** Overdue first (oldest → newest), then upcoming inside the window (nearest day first). */
  tasks: TaskCard[];
  overdueCount: number;
  /** Last day the upcoming window covers. */
  windowEndKey: string;
  /** Weeks the window spans beyond the current one, after any automatic roll-forward. */
  weeksAhead: number;
  /** Upcoming tasks scheduled past the window. */
  hiddenCount: number;
  /** Day of the nearest task past the window — what extending would reveal. */
  nextHiddenKey: string | null;
}

interface BuildPlanningPoolOptions {
  /** Extra whole weeks the user asked for on top of the current one. */
  extraWeeks?: number;
  /**
   * Pick renders only Today + the pool, so tomorrow and next week must fold into the
   * pool there or those tasks are invisible. Defer gives them their own columns.
   */
  poolAbsorbsNearDays: boolean;
}

/**
 * Candidates to pull into today, as a date-ordered window rather than every task ever.
 *
 * Day keys are `YYYY-MM-DD`, so lexicographic comparison is a valid date comparison.
 */
export function buildPlanningPool(
  tasks: TaskCard[],
  todayKey: string,
  { extraWeeks = 0, poolAbsorbsNearDays }: BuildPlanningPoolOptions,
): PlanningPool {
  const skipped = new Set([todayKey]);
  if (!poolAbsorbsNearDays) {
    skipped.add(tomorrowKey(todayKey));
    skipped.add(nextWeekStartKey(todayKey));
  }

  // Done tasks from other days are not candidates for today, only noise in the pool.
  const candidates = tasks.filter(
    (task) =>
      isVisibleTask(task) &&
      task.status !== 'done' &&
      Boolean(task.scheduledStart) &&
      !skipped.has(taskDayKey(task)),
  );

  const overdue = candidates
    .filter((task) => taskDayKey(task) < todayKey)
    .sort(compareByScheduleAsc);
  const upcoming = candidates
    .filter((task) => taskDayKey(task) > todayKey)
    .sort(compareByScheduleAsc);

  let weeksAhead = Math.max(0, Math.trunc(extraWeeks));
  let windowEndKey = weekWindowEndKey(todayKey, weeksAhead);

  // Nothing left in range: roll the window forward whole weeks until it reaches the
  // nearest upcoming task, so the column is never pointlessly empty and days from
  // different weeks never interleave.
  if (upcoming.length > 0 && taskDayKey(upcoming[0]) > windowEndKey) {
    const nearestKey = taskDayKey(upcoming[0]);
    while (windowEndKey < nearestKey) {
      weeksAhead += 1;
      windowEndKey = weekWindowEndKey(todayKey, weeksAhead);
    }
  }

  const inWindow = upcoming.filter((task) => taskDayKey(task) <= windowEndKey);
  const beyond = upcoming.filter((task) => taskDayKey(task) > windowEndKey);

  return {
    tasks: [...overdue, ...inWindow],
    overdueCount: overdue.length,
    windowEndKey,
    weeksAhead,
    hiddenCount: beyond.length,
    nextHiddenKey: beyond.length > 0 ? taskDayKey(beyond[0]) : null,
  };
}

export function totalDurationLabel(tasks: TaskCard[]): string {
  return formatPlanningDuration(sumDurationMin(tasks));
}

export function formatPlanningDuration(totalMin: number): string {
  if (totalMin <= 0) return '0m';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function durationLabel(task: TaskCard): string {
  return formatPlanningDuration(defaultDurationMin(task));
}
