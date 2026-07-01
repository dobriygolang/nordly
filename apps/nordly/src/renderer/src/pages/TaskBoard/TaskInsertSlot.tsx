import type { CSSProperties } from 'react';

import type { TaskCard } from '@features/tasks/api/tasks';
import { defaultDurationMin, formatDurationShort } from './lib/dates';
import { taskEpicColor } from './lib/taskUi';

interface TaskInsertSlotProps {
  task: TaskCard;
}

/** Drop preview — shows where the dragged task will land between siblings. */
export function TaskInsertSlot({ task }: TaskInsertSlotProps): JSX.Element {
  const epicColor = taskEpicColor(task);

  return (
    <div
      className="nordly-task-insert-slot"
      aria-hidden
      data-epic={epicColor ? 'true' : 'false'}
      style={
        epicColor ? ({ '--task-epic-color': epicColor } as CSSProperties) : undefined
      }
    >
      <span className="nordly-task-insert-slot__title">
        {task.title || '…'}
      </span>
      <span className="mono nordly-task-insert-slot__duration">
        {formatDurationShort(defaultDurationMin(task))}
      </span>
    </div>
  );
}
