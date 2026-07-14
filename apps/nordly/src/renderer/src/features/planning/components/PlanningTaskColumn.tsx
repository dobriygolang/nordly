import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useMemo, Fragment } from 'react';
import { useT } from '@nordly-i18n';

import type { TaskCard, ConferenceProvider, TaskEpicSelection } from '@features/tasks/api/tasks';
import type { TaskEpic } from '@features/tasks/api/epics';
import type { TrackerSettings } from '@features/calendar/remote/calendarClient';
import { SortableTaskRow } from '@features/tasks/components/SortableTaskRow';
import { DayTaskInsertSlot } from '@features/tasks/components/DayTaskInsertSlot';
import { resolveTasksForColumn, uniqueTaskIds } from '@features/tasks/lib/dayTaskDndUtils';
import { formatDuration, sumDurationMin } from '@shared/lib/dates';

const COL_W = 270;

interface PlanningTaskColumnProps {
  dayKey: string;
  title: string;
  subtitle?: string;
  taskIds: string[];
  taskById: Map<string, TaskCard>;
  dropHighlight: boolean;
  insertPreviewAt?: number | null;
  previewTask?: TaskCard | null;
  detailTaskId: string | null;
  epics: TaskEpic[];
  settings: TrackerSettings | null;
  editRequest: { taskId: string; key: number } | null;
  showAdd?: boolean;
  noDrop?: boolean;
  isDragging: boolean;
  onAddClick: () => void;
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

export function PlanningTaskColumn({
  dayKey,
  title,
  subtitle,
  taskIds,
  taskById,
  dropHighlight,
  insertPreviewAt = null,
  previewTask = null,
  detailTaskId,
  epics,
  settings,
  editRequest,
  showAdd,
  noDrop,
  isDragging,
  onAddClick,
  onToggleDone,
  onDurationChange,
  onTitleChange,
  onOpenDetail,
  onCloseDetail,
  onEpicChange,
  onCreateConference,
  onClearConference,
  onTaskTap,
}: PlanningTaskColumnProps): JSX.Element {
  const t = useT();
  const columnTaskIds = useMemo(() => uniqueTaskIds(taskIds), [taskIds]);
  const tasks = useMemo(
    () => resolveTasksForColumn(columnTaskIds, taskById),
    [columnTaskIds, taskById],
  );
  const total = formatDuration(sumDurationMin(tasks));

  const { setNodeRef } = useDroppable({ id: dayKey, disabled: noDrop });

  return (
    <section
      className={`nordly-day-column nordly-planning-day-column${dropHighlight ? ' nordly-day-column--drop' : ''}`}
      data-day-key={dayKey}
      data-planning-no-drop={noDrop ? 'true' : undefined}
      style={{
        flex: `0 0 ${COL_W}px`,
        width: COL_W,
        height: '100%',
        minHeight: '100%',
      }}
    >
      <div ref={setNodeRef} className="nordly-day-column__body">
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
            style={{ pointerEvents: isDragging ? 'none' : 'auto' }}
          >
            {t('nordly.taskboard.add_task')}
          </button>
        ) : null}

        <div className="nordly-day-column__tasks">
          <SortableContext items={columnTaskIds} strategy={verticalListSortingStrategy}>
            {tasks.map((task, index) => (
              <Fragment key={task.id}>
                {insertPreviewAt === index && previewTask ? (
                  <DayTaskInsertSlot task={previewTask} epics={epics} settings={settings} />
                ) : null}
                <SortableTaskRow
                  containerId={dayKey}
                  task={task}
                  epics={epics}
                  settings={settings}
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
                  onTaskTap={onTaskTap}
                />
              </Fragment>
            ))}
            {insertPreviewAt != null && insertPreviewAt >= tasks.length && previewTask ? (
              <DayTaskInsertSlot task={previewTask} epics={epics} settings={settings} />
            ) : null}
          </SortableContext>
        </div>
      </div>
    </section>
  );
}
