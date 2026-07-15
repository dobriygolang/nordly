import type { TaskCard } from '@features/tasks/api/tasks';
import type { TaskEpic } from '@features/tasks/api/epics';
import type { TrackerSettings } from '@features/calendar/api/calendarClient';

import { TaskRow } from './TaskRow';

const noop = (): void => undefined;
const noopTask = (): Promise<TaskCard> => Promise.reject(new Error('preview'));

interface DayTaskInsertSlotProps {
  task: TaskCard;
  epics: TaskEpic[];
  settings: TrackerSettings | null;
}

/** In-list preview of where the dragged task would land on drop. */
export function DayTaskInsertSlot({
  task,
  epics,
  settings,
}: DayTaskInsertSlotProps): JSX.Element {
  return (
    <div className="nordly-day-column__insert-preview" aria-hidden data-flip-key="__insert__">
      <TaskRow
        task={task}
        epics={epics}
        settings={settings}
        dragging={false}
        overlay
        detailOpen={false}
        onToggleDone={noop}
        onDurationChange={noop}
        onTitleChange={noop}
        onOpenDetail={noop}
        onCloseDetail={noop}
        onEpicChange={noop}
        onCreateConference={noopTask}
        onClearConference={noop}
      />
    </div>
  );
}
