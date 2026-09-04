// Task rollover — carry unfinished tasks forward.
//
// Once per day, after 03:00 local time, any unfinished task (not done /
// dismissed) whose scheduled start is on an earlier day is re-anchored onto
// today at the same clock time, so it stops living in a stale past column.
// Gated by the `taskRollover` setting; runs at startup and on window focus,
// idempotent via a per-user per-day marker in localStorage.
import { listTasks, scheduleTask } from '@features/tasks/api/tasks';
import { taskDurationMin } from '@features/tasks/model/duration';
import { isTaskDone, isVisibleTaskStatus } from '@features/tasks/model/status';
import { getDbUserId } from '@shared/db/nordlyDb';
import { parseScheduleInstant, toDayKey } from '@shared/lib/dates';
import { readTaskRollover } from '@shared/model/settings';
import { STORAGE_KEYS } from '@shared/lib/storage-keys';

const ROLLOVER_KEY_PREFIX = STORAGE_KEYS.taskRolloverDay;
/** Rollover only kicks in after this local hour so early-morning work still
 * counts against "yesterday" until the day has clearly turned over. */
const ROLLOVER_HOUR = 3;

function rolloverStorageKey(userId: string): string {
  return `${ROLLOVER_KEY_PREFIX}:${userId}`;
}

function lastRolloverDay(userId: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(rolloverStorageKey(userId));
  } catch (err) {
    console.warn('[taskRollover] read failed', err);
    return null;
  }
}

function markRolloverDay(userId: string, dayKey: string): void {
  if (typeof window === 'undefined') {
    throw new Error('task rollover requires window.localStorage');
  }
  try {
    window.localStorage.setItem(rolloverStorageKey(userId), dayKey);
  } catch (err) {
    throw new Error(
      `task rollover marker persist failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
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
    if (isTaskDone(task.status) || !isVisibleTaskStatus(task.status)) continue;
    if (!task.scheduledStart) continue;
    const start = parseScheduleInstant(task.scheduledStart);
    if (toDayKey(start) >= todayKey) continue;

    const movedStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      start.getHours(),
      start.getMinutes(),
    );
    await scheduleTask(task.id, movedStart, taskDurationMin(task));
    moved++;
  }

  markRolloverDay(userId, todayKey);
  return moved;
}
