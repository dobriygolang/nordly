export {
  TASK_DURATION_DEFAULT,
  TASK_DURATION_MAX,
  TASK_DURATION_MIN,
  clampTaskDurationMin,
  sumTaskDurationMin,
  taskDurationMin,
  type TaskDurationFields,
} from '@shared/lib/taskDuration';

import {
  TASK_DURATION_DEFAULT,
  TASK_DURATION_MAX,
  TASK_DURATION_MIN,
} from '@shared/lib/taskDuration';

export const TASK_DURATION_PRESETS_MIN = [
  TASK_DURATION_MIN,
  20,
  TASK_DURATION_DEFAULT,
  45,
  60,
  120,
  180,
  240,
  360,
  TASK_DURATION_MAX,
] as const;
