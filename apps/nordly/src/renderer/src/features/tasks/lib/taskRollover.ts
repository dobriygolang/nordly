// Task rollover — carry unfinished tasks forward.
//
// Once per day, after 03:00 local time, any unfinished task (not done /
// dismissed) whose scheduled start is on an earlier day is re-anchored onto
// today at the same clock time, so it stops living in a stale past column.
// Gated by the `taskRollover` setting; runs at startup and on window focus,
// idempotent via a per-user per-day marker in localStorage.
import { listTasks, scheduleTask } from '@features/tasks/api/tasks';
import { getDbUserId } from '@shared/db/nordlyDb';
import { defaultDurationMin, parseScheduleInstant, toDayKey } from '@shared/lib/dates';
import { readTaskRollover } from '@shared/model/settings';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';

const ROLLOVER_KEY_PREFIX = 'nordly:task-rollover-day';
/** Rollover only kicks in after this local hour so early-morning work still
 * counts against "yesterday" until the day has clearly turned over. */
const ROLLOVER_HOUR = 3;

function rolloverStorageKey(userId: string): string {
  return `${ROLLOVER_KEY_PREFIX}:${userId}`;
}

function lastRolloverDay(userId: string): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(rolloverStorageKey(userId));
}

function markRolloverDay(userId: string, dayKey: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(rolloverStorageKey(userId), dayKey);
}

/**
 * Re-anchor stale unfinished tasks onto today. Returns the number of tasks
 * moved. No-op when the setting is off, before {@link ROLLOVER_HOUR}, or when
 * already run for the current local day.
 */
export async function runTaskRollover(now: Date = new Date()): Promise<number> {
  if (!readTaskRollover()) return 0;
  if (now.getHours() < ROLLOVER_HOUR) return 0;

  const userId = getDbUserId();
  if (!userId) return 0;

  const todayKey = toDayKey(now);
  if (lastRolloverDay(userId) === todayKey) return 0;

  const tasks = await listTasks();
  let moved = 0;
  for (const task of tasks) {
    if (task.status === 'done' || task.status === 'dismissed') continue;
    if (!task.scheduledStart) continue;
    const start = parseScheduleInstant(task.scheduledStart);
    if (Number.isNaN(start.getTime())) continue;
    if (toDayKey(start) >= todayKey) continue;

    const movedStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      start.getHours(),
      start.getMinutes(),
    );
    await scheduleTask(task.id, movedStart, defaultDurationMin(task));
    moved++;
  }

  markRolloverDay(userId, todayKey);
  if (moved > 0 && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(NORDLY_EVENTS.tasksChanged));
  }
  return moved;
}
