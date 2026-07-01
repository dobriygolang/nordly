import type { CSSProperties } from 'react';

import type { TaskCard } from '@features/tasks/api/tasks';
import { defaultDurationMin, formatDurationShort } from './lib/dates';
import { epicById, type TaskEpic } from './lib/taskUi';

interface TaskInsertSlotProps {
  task: TaskCard;
  epics: TaskEpic[];
}

/** Drop preview — shows where the dragged task will land between siblings. */
export function TaskInsertSlot({ task, epics }: TaskInsertSlotProps): JSX.Element {
  const epic = epicById(epics, task.epicId);

  return (
    <div
      className="nordly-task-insert-slot"
      aria-hidden
      data-epic={epic ? 'true' : 'false'}
      style={
        epic ? ({ '--task-epic-color': epic.color } as CSSProperties) : undefined
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
