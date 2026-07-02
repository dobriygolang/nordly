import { memo, useMemo, type HTMLAttributes } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import type { TaskCard, ConferenceProvider, TaskEpicSelection } from '@features/tasks/api/tasks';
import type { TaskEpic } from '@features/tasks/api/epics';
import type { TrackerSettings } from '@features/calendar/api/calendarClient';

import { TaskRow } from './TaskRow';

interface SortableTaskRowProps {
  task: TaskCard;
  containerId: string;
  epics: TaskEpic[];
  settings: TrackerSettings | null;
  detailOpen: boolean;
  editRequestKey?: number;
  disabled?: boolean;
  onToggleDone: (task: TaskCard) => void;
  onDurationChange: (task: TaskCard, minutes: number) => void;
  onTitleChange: (task: TaskCard, title: string) => void;
  onOpenDetail: (task: TaskCard) => void;
  onCloseDetail: () => void;
  onEpicChange: (task: TaskCard, selection: TaskEpicSelection) => void;
  onCreateConference: (task: TaskCard, provider: ConferenceProvider) => Promise<TaskCard>;
  onClearConference: (task: TaskCard) => void;
  onTaskTap?: (taskId: string) => void;
}

export const SortableTaskRow = memo(function SortableTaskRow({
  task,
  containerId,
  disabled,
  onTaskTap,
  ...taskRowProps
}: SortableTaskRowProps): JSX.Element {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    disabled,
    data: { type: 'task', containerId },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? undefined : transition,
  };

  const dragHandleProps = useMemo<HTMLAttributes<HTMLElement>>(
    () => ({ ...attributes, ...listeners }),
    [
      listeners,
      attributes.role,
      attributes.tabIndex,
      attributes['aria-disabled'],
      attributes['aria-pressed'],
      attributes['aria-roledescription'],
      attributes['aria-describedby'],
    ],
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`nordly-sortable-task${isDragging ? ' nordly-sortable-task--dragging' : ''}`}
    >
      <TaskRow
        task={task}
        dragging={isDragging}
        dragHandleProps={dragHandleProps}
        onTaskTap={onTaskTap}
        {...taskRowProps}
      />
    </div>
  );
});
