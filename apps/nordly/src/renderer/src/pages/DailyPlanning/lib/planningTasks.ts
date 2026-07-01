import type { TaskCard } from '@features/tasks/api/tasks';
import {
  addDays,
  buildDefaultScheduleDate,
  defaultDurationMin,
  parseDayKey,
  resolveScheduleStart,
  startOfLocalDay,
  sumDurationMin,
  taskDayKey,
  taskScheduleStart,
  toDayKey,
} from '@pages/TaskBoard/lib/dates';

/** Synthetic day key for the "all other tasks" pool column — not a real schedule target. */
export const PLANNING_POOL_DAY_KEY = '__planning_pool__';

export const VISIBLE_TASK_STATUSES = new Set<TaskCard['status']>([
  'todo',
  'in_progress',
  'in_review',
  'done',
]);

export type PlanningColumnId = 'today' | 'all' | 'tomorrow' | 'next_week';

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

export function tasksForAllPool(tasks: TaskCard[], todayKey: string): TaskCard[] {
  return tasks
    .filter(isVisibleTask)
    .filter((task) => Boolean(task.scheduledStart) && taskColumnKey(task, todayKey) !== todayKey)
    .sort(sortPlanningTasks);
}

export function tasksForDayKey(tasks: TaskCard[], dayKey: string, todayKey: string): TaskCard[] {
  return tasks
    .filter(isVisibleTask)
    .filter((task) => taskColumnKey(task, todayKey) === dayKey)
    .sort(sortPlanningTasks);
}

function sortPlanningTasks(a: TaskCard, b: TaskCard): number {
  const aDone = a.status === 'done' ? 1 : 0;
  const bDone = b.status === 'done' ? 1 : 0;
  if (aDone !== bDone) return aDone - bDone;
  const aOrder = a.order ?? taskScheduleStart(a)?.getTime() ?? new Date(a.createdAt).getTime();
  const bOrder = b.order ?? taskScheduleStart(b)?.getTime() ?? new Date(b.createdAt).getTime();
  return aOrder - bOrder;
}

export function findPlanningDayKey(task: TaskCard, todayKey: string): string {
  if (!task.scheduledStart) return todayKey;
  const key = taskDayKey(task);
  if (key === todayKey) return todayKey;
  const tomorrow = tomorrowKey(todayKey);
  if (key === tomorrow) return tomorrow;
  const monday = nextMondayKey(todayKey);
  if (key === monday) return monday;
  return PLANNING_POOL_DAY_KEY;
}

/** Next calendar Monday strictly after today (or next week if today is Monday). */
export function nextMonday(from = new Date()): Date {
  const d = startOfLocalDay(from);
  const dow = d.getDay();
  const add = dow === 0 ? 1 : 8 - dow;
  return addDays(d, add);
}

export function tomorrowKey(todayKey: string): string {
  return toDayKey(addDays(parseDayKeyLocal(todayKey), 1));
}

export function nextMondayKey(todayKey: string): string {
  return toDayKey(nextMonday(parseDayKeyLocal(todayKey)));
}

function parseDayKeyLocal(key: string): Date {
  return parseDayKey(key);
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

/** First calendar day that lands in the "all tasks" pool (not today / tomorrow / next Monday). */
export function poolDayKey(todayKey: string): string {
  const tomorrow = tomorrowKey(todayKey);
  const monday = nextMondayKey(todayKey);
  let d = addDays(parseDayKeyLocal(todayKey), 2);
  for (let i = 0; i < 14; i++) {
    const key = toDayKey(d);
    if (key !== todayKey && key !== tomorrow && key !== monday) return key;
    d = addDays(d, 1);
  }
  return toDayKey(addDays(parseDayKeyLocal(todayKey), 7));
}

export function scheduleTargetForPool(todayKey: string, tasks: TaskCard[]): Date {
  const key = poolDayKey(todayKey);
  return resolveScheduleStart(key, tasks, buildDefaultScheduleDate(parseDayKeyLocal(key)));
}

export function scheduleTargetForColumn(
  column: PlanningColumnId,
  todayKey: string,
  tasks: TaskCard[],
): Date {
  if (column === 'today') {
    return resolveScheduleStart(todayKey, tasks, buildDefaultScheduleDate(parseDayKeyLocal(todayKey)));
  }
  if (column === 'tomorrow') {
    const key = tomorrowKey(todayKey);
    return resolveScheduleStart(key, tasks, buildDefaultScheduleDate(parseDayKeyLocal(key)));
  }
  const key = nextMondayKey(todayKey);
  return resolveScheduleStart(key, tasks, buildDefaultScheduleDate(parseDayKeyLocal(key)));
}

export function durationLabel(task: TaskCard): string {
  return formatPlanningDuration(defaultDurationMin(task));
}

export function planningColumnForTask(task: TaskCard, todayKey: string): PlanningColumnId {
  const key = taskColumnKey(task, todayKey);
  if (key === todayKey) return 'today';
  if (key === tomorrowKey(todayKey)) return 'tomorrow';
  if (key === nextMondayKey(todayKey)) return 'next_week';
  return 'all';
}
