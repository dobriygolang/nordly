import type { TaskCard } from '@features/tasks/model/task';
import { clampTaskDurationMin } from '@features/tasks/model/duration';
import {
  buildDefaultScheduleDate,
  parseDayKey,
  resolveScheduleStart,
  scheduleStartISO,
  taskDayKey,
  taskScheduleStart,
} from '@shared/lib/dates';

export interface TaskDurationSchedule {
  dayKey: string;
  start: Date;
  startIso: string;
  durationMin: number;
}

/** Resolve a duration edit against collisions on the task's persisted day. */
export function resolveTaskDurationSchedule(
  task: TaskCard,
  tasks: TaskCard[],
  todayKey: string,
  durationMin: number,
): TaskDurationSchedule {
  const clamped = clampTaskDurationMin(durationMin);
  const dayKey = task.scheduledStart ? taskDayKey(task) : todayKey;
  const day = parseDayKey(dayKey);
  const preferred = taskScheduleStart(task) ?? buildDefaultScheduleDate(day);
  const start = resolveScheduleStart(dayKey, tasks, preferred, task.id);

  return {
    dayKey,
    start,
    startIso: scheduleStartISO(start),
    durationMin: clamped,
  };
}
