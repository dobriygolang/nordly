export const TASK_DURATION_MIN = 15;
export const TASK_DURATION_DEFAULT = 30;
export const TASK_DURATION_MAX = 480;

export interface TaskDurationFields {
  scheduledDurationMin?: number;
}

export function clampTaskDurationMin(durationMin: number): number {
  if (!Number.isFinite(durationMin)) {
    throw new Error(`Invalid task duration: ${String(durationMin)}`);
  }
  return Math.max(TASK_DURATION_MIN, Math.min(TASK_DURATION_MAX, durationMin));
}

export function taskDurationMin(task: TaskDurationFields): number {
  return task.scheduledDurationMin === undefined
    ? TASK_DURATION_DEFAULT
    : clampTaskDurationMin(task.scheduledDurationMin);
}

export function sumTaskDurationMin(tasks: TaskDurationFields[]): number {
  return tasks.reduce((total, task) => total + taskDurationMin(task), 0);
}
