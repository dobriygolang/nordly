import { useT } from '@nordly-i18n';

import type { TaskCard } from '@features/tasks/api/tasks';
import type { TaskEpic } from '@features/tasks/api/epics';
import type { TrackerSettings } from '@features/calendar/api/calendarClient';
import { parseDayKey } from '@shared/lib/dates';

import { PlanningTaskColumn } from '@features/planning/components/PlanningTaskColumn';
import { PLANNING_POOL_DAY_KEY } from '@features/planning/lib/planningTasks';
import type { usePlanningTaskBoard } from '@features/planning/hooks/usePlanningTaskBoard';

type PlanningBoard = ReturnType<typeof usePlanningTaskBoard>;

interface PickStepProps {
  todayKey: string;
  epics: TaskEpic[];
  settings: TrackerSettings | null;
  board: PlanningBoard;
}

export function PickStep({ todayKey, epics, settings, board }: PickStepProps): JSX.Element {
  const t = useT();
  const todayDate = parseDayKey(todayKey);

  const columnProps = {
    epics,
    settings,
    draggingId: board.draggingId,
    draggingTask: board.draggingTask,
    detailTaskId: board.detailTaskId,
    editRequest: board.editRequest,
    onToggleDone: board.handleToggleDone,
    onTitleChange: (task: TaskCard, title: string) => void board.handleTitleChange(task, title),
    onOpenDetail: board.handleOpenDetail,
    onCloseDetail: board.handleCloseDetail,
    onEpicChange: (task: TaskCard, selection: Parameters<PlanningBoard['handleEpicChange']>[1]) =>
      void board.handleEpicChange(task, selection),
    onCreateConference: board.handleCreateConference,
    onClearConference: (task: TaskCard) => void board.handleClearConference(task),
    onPointerDragStart: board.onPointerDragStart,
  };

  return (
    <div className="nordly-planning-cols" data-cols="2">
      <PlanningTaskColumn
        dayKey={todayKey}
        title={t('nordly.planning.col_today')}
        subtitle={t('nordly.planning.col_today_hint')}
        tasks={board.tasksByDay.get(todayKey) ?? []}
        durationTasks={board.columnDurationTasks(todayKey)}
        dropHighlight={board.dropDay === todayKey && board.draggingId !== null}
        dropInsertBeforeId={board.dropDay === todayKey ? board.dropInsertBeforeId : null}
        showAdd
        onAddClick={() => void board.handleAddTask(todayKey)}
        onDurationChange={(task, min) => void board.handleDurationChange(task, min, todayDate)}
        {...columnProps}
      />
      <PlanningTaskColumn
        dayKey={PLANNING_POOL_DAY_KEY}
        title={t('nordly.planning.col_all_tasks')}
        subtitle={t('nordly.planning.col_all_hint')}
        tasks={board.tasksByDay.get(PLANNING_POOL_DAY_KEY) ?? []}
        durationTasks={board.columnDurationTasks(PLANNING_POOL_DAY_KEY)}
        dropHighlight={board.dropDay === PLANNING_POOL_DAY_KEY && board.draggingId !== null}
        dropInsertBeforeId={board.dropDay === PLANNING_POOL_DAY_KEY ? board.dropInsertBeforeId : null}
        onAddClick={() => undefined}
        onDurationChange={(task, min) => void board.handleDurationChange(task, min, todayDate)}
        {...columnProps}
      />
    </div>
  );
}
