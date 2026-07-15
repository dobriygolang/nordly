import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { memo, useId, useMemo, Fragment } from 'react';
import { useT, useLocale } from '@nordly-i18n';

import type { TaskCard, ConferenceProvider, TaskEpicSelection } from '@features/tasks/api/tasks';
import type { TaskEpic } from '@features/tasks/api/epics';
import type { TrackerSettings } from '@features/calendar/api/calendarClient';
import { formatColumnHeader, formatDuration, sumDurationMin } from '@shared/lib/dates';
import { resolveTasksForColumn, uniqueTaskIds } from '@features/tasks/lib/dayTaskDndUtils';
import { SortableTaskRow } from '@features/tasks/components/SortableTaskRow';
import { DayTaskInsertSlot } from '@features/tasks/components/DayTaskInsertSlot';

const COL_W = 270;

interface DayColumnProps {
  dayKey: string;
  date: Date;
  today: Date;
  taskIds: string[];
  taskById: Map<string, TaskCard>;
  dropHighlight: boolean;
  insertPreviewAt: number | null;
  previewTask: TaskCard | null;
  detailTaskId: string | null;
  epics: TaskEpic[];
  settings: TrackerSettings | null;
  editRequest: { taskId: string; key: number } | null;
  selected: boolean;
  isDragging: boolean;
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
  onTaskTap?: (taskId: string) => void;
}

export const DayColumn = memo(function DayColumn({
  dayKey,
  date,
  today,
  taskIds,
  taskById,
  dropHighlight,
  insertPreviewAt,
  previewTask,
  detailTaskId,
  epics,
  settings,
  editRequest,
  selected,
  isDragging,
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
  onTaskTap,
}: DayColumnProps): JSX.Element {
  const t = useT();
  const [locale] = useLocale();
  const { weekday, label, isToday } = formatColumnHeader(date, today, locale);
  const headerId = useId();
  const columnTaskIds = useMemo(() => uniqueTaskIds(taskIds), [taskIds]);
  const tasks = useMemo(
    () => resolveTasksForColumn(columnTaskIds, taskById),
    [columnTaskIds, taskById],
  );
  const total = formatDuration(sumDurationMin(tasks));

  const { setNodeRef } = useDroppable({ id: dayKey });

  return (
    <section
      className={`nordly-day-column${dropHighlight ? ' nordly-day-column--drop' : ''}`}
      data-day-key={dayKey}
      data-selected={selected ? 'true' : 'false'}
      role="region"
      aria-labelledby={headerId}
      aria-current={isToday ? 'date' : undefined}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (
          event.target === event.currentTarget &&
          (event.key === 'Enter' || event.key === ' ')
        ) {
          event.preventDefault();
          onSelect();
        }
      }}
      style={{
        flex: `0 0 ${COL_W}px`,
        width: COL_W,
        height: '100%',
        minHeight: '100%',
      }}
    >
      <div ref={setNodeRef} className="nordly-day-column__body">
        <header className="nordly-day-column__header">
          <div id={headerId} className="nordly-day-column__header-main">
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
          aria-describedby={headerId}
          onClick={(e) => {
            e.stopPropagation();
            onAddClick();
          }}
          style={{ pointerEvents: isDragging ? 'none' : 'auto' }}
        >
          {t('nordly.taskboard.add_task')}
        </button>

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
}, areDayColumnPropsEqual);

/** Only the column that owns the detail/edit target should react to those props. */
function detailSig(id: string | null, ids: string[]): string {
  return id && ids.includes(id) ? id : '';
}

function editSig(req: { taskId: string; key: number } | null, ids: string[]): string {
  return req && ids.includes(req.taskId) ? `${req.taskId}:${req.key}` : '';
}

function areDayColumnPropsEqual(prev: DayColumnProps, next: DayColumnProps): boolean {
  return (
    prev.dayKey === next.dayKey &&
    prev.date === next.date &&
    prev.today === next.today &&
    prev.taskIds === next.taskIds &&
    prev.taskById === next.taskById &&
    prev.dropHighlight === next.dropHighlight &&
    prev.insertPreviewAt === next.insertPreviewAt &&
    prev.previewTask === next.previewTask &&
    prev.epics === next.epics &&
    prev.settings === next.settings &&
    prev.selected === next.selected &&
    prev.isDragging === next.isDragging &&
    detailSig(prev.detailTaskId, prev.taskIds) === detailSig(next.detailTaskId, next.taskIds) &&
    editSig(prev.editRequest, prev.taskIds) === editSig(next.editRequest, next.taskIds)
  );
}
