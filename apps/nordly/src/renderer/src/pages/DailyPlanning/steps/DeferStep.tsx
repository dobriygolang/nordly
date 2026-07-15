import { useT } from '@nordly-i18n';

import type { TaskCard } from '@features/tasks/api/tasks';
import type { TaskEpic } from '@features/tasks/api/epics';
import type { TrackerSettings } from '@features/calendar/api/calendarClient';
import { parseDayKey } from '@shared/lib/dates';

import { DayTaskDndContext } from '@features/tasks/components/DayTaskDndContext';
import { PlanningTaskColumn } from '@features/planning/components/PlanningTaskColumn';
import type { usePlanningTaskBoard } from '@features/planning/hooks/usePlanningTaskBoard';

type PlanningBoard = ReturnType<typeof usePlanningTaskBoard>;

interface DeferStepProps {
  todayKey: string;
  epics: TaskEpic[];
  settings: TrackerSettings | null;
  board: PlanningBoard;
}

export function DeferStep({ todayKey, epics, settings, board }: DeferStepProps): JSX.Element {
  const t = useT();
  const todayDate = parseDayKey(todayKey);
  const tomorrowDate = parseDayKey(board.tomorrow);
  const mondayDate = parseDayKey(board.monday);
  const { dnd } = board;

  const columnProps = {
    epics,
    settings,
    detailTaskId: board.detailTaskId,
    editRequest: board.editRequest,
    isDragging: dnd.isDragging,
    previewTask: dnd.activeTask,
    onToggleDone: board.handleToggleDone,
    onTitleChange: (task: TaskCard, title: string) => void board.handleTitleChange(task, title),
    onOpenDetail: board.handleOpenDetail,
    onCloseDetail: board.handleCloseDetail,
    onEpicChange: (task: TaskCard, selection: Parameters<PlanningBoard['handleEpicChange']>[1]) =>
      void board.handleEpicChange(task, selection),
    onCreateConference: board.handleCreateConference,
    onClearConference: (task: TaskCard) => void board.handleClearConference(task),
    onDelete: (task: TaskCard) => void board.handleDeleteTask(task),
    onTaskTap: board.handleTaskTap,
    onAddClick: () => undefined,
  };

  return (
    <DayTaskDndContext dnd={dnd} epics={epics} settings={settings}>
      <div className="nordly-planning-cols" data-cols="3">
        <PlanningTaskColumn
          dayKey={todayKey}
          title={t('nordly.planning.col_today')}
          subtitle={t('nordly.planning.col_today_defer_hint')}
          taskIds={dnd.getColumnTaskIds(todayKey)}
          taskById={dnd.taskById}
          dropHighlight={dnd.overContainerId === todayKey && dnd.isDragging}
          insertPreviewAt={dnd.getColumnInsertPreviewAt(todayKey)}
          onDurationChange={(task, min) => void board.handleDurationChange(task, min, todayDate)}
          {...columnProps}
        />
        <PlanningTaskColumn
          dayKey={board.tomorrow}
          title={t('nordly.planning.col_tomorrow')}
          subtitle={t('nordly.planning.col_tomorrow_hint')}
          taskIds={dnd.getColumnTaskIds(board.tomorrow)}
          taskById={dnd.taskById}
          dropHighlight={dnd.overContainerId === board.tomorrow && dnd.isDragging}
          insertPreviewAt={dnd.getColumnInsertPreviewAt(board.tomorrow)}
          onDurationChange={(task, min) => void board.handleDurationChange(task, min, tomorrowDate)}
          {...columnProps}
        />
        <PlanningTaskColumn
          dayKey={board.monday}
          title={t('nordly.planning.col_next_week')}
          subtitle={t('nordly.planning.col_next_week_hint')}
          taskIds={dnd.getColumnTaskIds(board.monday)}
          taskById={dnd.taskById}
          dropHighlight={dnd.overContainerId === board.monday && dnd.isDragging}
          insertPreviewAt={dnd.getColumnInsertPreviewAt(board.monday)}
          onDurationChange={(task, min) => void board.handleDurationChange(task, min, mondayDate)}
          {...columnProps}
        />
      </div>
    </DayTaskDndContext>
  );
}
