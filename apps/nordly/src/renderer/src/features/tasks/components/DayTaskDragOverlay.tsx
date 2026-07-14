import type { TaskCard } from '@features/tasks/api/tasks';
import type { TaskEpic } from '@features/tasks/api/epics';
import type { TrackerSettings } from '@features/calendar/remote/calendarClient';

import { TaskRow } from './TaskRow';

const noop = (): void => undefined;
const noopTask = (): Promise<TaskCard> => Promise.reject(new Error('overlay'));

interface DayTaskDragOverlayProps {
  task: TaskCard | null;
  epics: TaskEpic[];
  settings: TrackerSettings | null;
}

export function DayTaskDragOverlay({ task, epics, settings }: DayTaskDragOverlayProps): JSX.Element | null {
  if (!task) return null;

  return (
    <div className="nordly-task-row nordly-task-row--ghost">
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
