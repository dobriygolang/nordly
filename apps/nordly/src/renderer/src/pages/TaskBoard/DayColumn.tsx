import { Fragment, memo } from 'react';
import { useT, useLocale } from '@nordly-i18n';

import type { TaskCard, ConferenceProvider, TaskEpicSelection } from '@features/tasks/api/tasks';
import type { TaskEpic } from '@features/tasks/api/epics';
import type { TrackerSettings } from '@features/calendar/api/calendarClient';
import { formatColumnHeader, formatDuration, sumDurationMin } from '@shared/lib/dates';
import { TaskInsertSlot } from '@features/tasks/components/TaskInsertSlot';
import { TaskRow } from '@features/tasks/components/TaskRow';
import { useFlipList } from '@shared/lib/useFlipList';

const COL_W = 254;

interface DayColumnProps {
  dayKey: string;
  date: Date;
  today: Date;
  tasks: TaskCard[];
  durationTasks: TaskCard[];
  draggingId: string | null;
  draggingTask: TaskCard | null;
  dropHighlight: boolean;
  dropInsertBeforeId: string | null;
  detailTaskId: string | null;
  epics: TaskEpic[];
  settings: TrackerSettings | null;
  editRequest: { taskId: string; key: number } | null;
  selected: boolean;
  onSelect: () => void;
  onAddClick: () => void;
  onToggleDone: (task: TaskCard) => void;
  onDurationChange: (task: TaskCard, minutes: number) => void;
  onTitleChange: (task: TaskCard, title: string) => void;
  onOpenDetail: (task: TaskCard) => void;
  onCloseDetail: () => void;
  onEpicChange: (task: TaskCard, selection: TaskEpicSelection) => void;
  onCreateConference: (task: TaskCard, provider: ConferenceProvider) => Promise<TaskCard>;
  onClearConference: (task: TaskCard) => void;
  onPointerDragStart: (taskId: string, e: React.PointerEvent) => void;
}

export const DayColumn = memo(function DayColumn({
  dayKey,
  date,
  today,
  tasks,
  durationTasks,
  draggingId,
  draggingTask,
  dropHighlight,
  dropInsertBeforeId,
  detailTaskId,
  epics,
  settings,
  editRequest,
  selected,
  onSelect,
  onAddClick,
  onToggleDone,
  onDurationChange,
  onTitleChange,
  onOpenDetail,
  onCloseDetail,
  onEpicChange,
  onCreateConference,
  onClearConference,
  onPointerDragStart,
}: DayColumnProps): JSX.Element {
  const t = useT();
  const [locale] = useLocale();
  const { weekday, label, isToday } = formatColumnHeader(date, today, locale);
  const total = formatDuration(sumDurationMin(durationTasks));

  const showInsertPreview = draggingId !== null && dropHighlight && draggingTask !== null;
  const listTasks =
    draggingId !== null && tasks.some((task) => task.id === draggingId)
      ? tasks.filter((task) => task.id !== draggingId)
      : tasks;

  const layoutSig = showInsertPreview ? (dropInsertBeforeId ?? '__end__') : '';
  const tasksRef = useFlipList(
    listTasks.map((task) => task.id),
    layoutSig,
  );

  return (
    <section
      className="nordly-day-column"
      data-day-key={dayKey}
      onClick={onSelect}
      style={{
        flex: `0 0 ${COL_W}px`,
        width: COL_W,
        height: '100%',
        minHeight: '100%',
      }}
    >
      <div className={`nordly-day-column__body${dropHighlight ? ' nordly-day-column__body--drop' : ''}`}>
        <header className="nordly-day-column__header">
          <div className="nordly-day-column__header-main">
            <div
              className="nordly-day-column__weekday"
              data-selected={selected ? 'true' : 'false'}
            >
              {weekday}
            </div>
            <div className="nordly-day-column__date">
              {label}
              {isToday ? ` · ${t('nordly.taskboard.today')}` : ''}
            </div>
          </div>
          <span className="mono nordly-day-column__total">{total}</span>
        </header>

        <button
          type="button"
          className="nordly-day-add-btn"
          onClick={(e) => {
            e.stopPropagation();
            onAddClick();
          }}
          style={{ pointerEvents: draggingId ? 'none' : 'auto' }}
        >
          {t('nordly.taskboard.add_task')}
        </button>

        <div className="nordly-day-column__tasks" ref={tasksRef}>
          {listTasks.map((task) => (
            <Fragment key={task.id}>
              {showInsertPreview && dropInsertBeforeId === task.id && (
                <TaskInsertSlot task={draggingTask} epics={epics} />
              )}
              <TaskRow
                task={task}
                epics={epics}
                settings={settings}
                dragging={draggingId === task.id}
                detailOpen={detailTaskId === task.id}
                editRequestKey={editRequest?.taskId === task.id ? editRequest.key : 0}
                onToggleDone={onToggleDone}
                onDurationChange={onDurationChange}
                onTitleChange={onTitleChange}
                onOpenDetail={onOpenDetail}
                onCloseDetail={onCloseDetail}
                onEpicChange={onEpicChange}
                onCreateConference={onCreateConference}
                onClearConference={onClearConference}
                onPointerDragStart={onPointerDragStart}
              />
            </Fragment>
          ))}
          {showInsertPreview && dropInsertBeforeId === null && (
            <TaskInsertSlot task={draggingTask} epics={epics} />
          )}
        </div>
      </div>
    </section>
  );
}, areDayColumnPropsEqual);

function areDayColumnPropsEqual(prev: DayColumnProps, next: DayColumnProps): boolean {
  return (
    prev.dayKey === next.dayKey &&
    prev.date === next.date &&
    prev.today === next.today &&
    prev.tasks === next.tasks &&
    prev.durationTasks === next.durationTasks &&
    prev.draggingId === next.draggingId &&
    prev.draggingTask === next.draggingTask &&
    prev.dropHighlight === next.dropHighlight &&
    prev.dropInsertBeforeId === next.dropInsertBeforeId &&
    prev.detailTaskId === next.detailTaskId &&
    prev.epics === next.epics &&
    prev.settings === next.settings &&
    prev.editRequest === next.editRequest &&
    prev.selected === next.selected
  );
}
