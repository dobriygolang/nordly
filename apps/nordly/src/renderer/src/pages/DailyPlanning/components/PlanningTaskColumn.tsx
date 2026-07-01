import { Fragment } from 'react';
import { useT } from '@nordly-i18n';

import type { TaskCard, ConferenceProvider, TaskEpicSelection } from '@features/tasks/api/tasks';
import type { TaskEpic } from '@features/tasks/api/epics';
import type { TrackerSettings } from '@features/calendar/api/calendarClient';
import { TaskInsertSlot } from '@pages/TaskBoard/TaskInsertSlot';
import { TaskRow } from '@pages/TaskBoard/TaskRow';
import { useFlipList } from '@pages/TaskBoard/useFlipList';
import { formatDuration, sumDurationMin } from '@pages/TaskBoard/lib/dates';

const COL_W = 254;

interface PlanningTaskColumnProps {
  dayKey: string;
  title: string;
  subtitle?: string;
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
  showAdd?: boolean;
  noDrop?: boolean;
  onAddClick: () => void;
  onToggleDone: (task: TaskCard) => void;
  onDurationChange: (task: TaskCard, minutes: number) => void;
  onTitleChange: (task: TaskCard, title: string) => void;
  onOpenDetail: (task: TaskCard) => void;
  onCloseDetail: () => void;
  onEpicChange: (task: TaskCard, selection: TaskEpicSelection) => void;
  onCreateConference: (task: TaskCard, provider: ConferenceProvider) => Promise<void>;
  onClearConference: (task: TaskCard) => void;
  onPointerDragStart: (taskId: string, e: React.PointerEvent) => void;
}

export function PlanningTaskColumn({
  dayKey,
  title,
  subtitle,
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
  showAdd,
  noDrop,
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
}: PlanningTaskColumnProps): JSX.Element {
  const t = useT();
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
      className="nordly-day-column nordly-planning-day-column"
      data-day-key={dayKey}
      data-planning-no-drop={noDrop ? 'true' : undefined}
      style={{
        flex: `0 0 ${COL_W}px`,
        width: COL_W,
        height: '100%',
        minHeight: '100%',
      }}
    >
      <div className={`nordly-day-column__body${dropHighlight ? ' nordly-day-column__body--drop' : ''}`}>
        <header className="nordly-planning-day-column__header">
          <div className="nordly-planning-day-column__header-main">
            <h3 className="nordly-planning-day-column__title">{title}</h3>
            {subtitle ? <p className="nordly-planning-day-column__sub">{subtitle}</p> : null}
          </div>
          <span className="mono nordly-day-column__total">{total}</span>
        </header>

        {showAdd ? (
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
        ) : null}

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
}
