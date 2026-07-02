import { useT } from '@nordly-i18n';

import type { TaskCard } from '@features/tasks/api/tasks';
import type { TaskEpic } from '@features/tasks/api/epics';
import type { TrackerSettings } from '@features/calendar/api/calendarClient';
import { parseDayKey } from '@shared/lib/dates';

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
    onAddClick: () => undefined,
  };

  return (
    <div className="nordly-planning-cols" data-cols="3">
      <PlanningTaskColumn
        dayKey={todayKey}
        title={t('nordly.planning.col_today')}
        subtitle={t('nordly.planning.col_today_defer_hint')}
        tasks={board.tasksByDay.get(todayKey) ?? []}
        durationTasks={board.columnDurationTasks(todayKey)}
        dropHighlight={board.dropDay === todayKey && board.draggingId !== null}
        dropInsertBeforeId={board.dropDay === todayKey ? board.dropInsertBeforeId : null}
        onDurationChange={(task, min) => void board.handleDurationChange(task, min, todayDate)}
        {...columnProps}
      />
      <PlanningTaskColumn
        dayKey={board.tomorrow}
        title={t('nordly.planning.col_tomorrow')}
        subtitle={t('nordly.planning.col_tomorrow_hint')}
        tasks={board.tasksByDay.get(board.tomorrow) ?? []}
        durationTasks={board.columnDurationTasks(board.tomorrow)}
        dropHighlight={board.dropDay === board.tomorrow && board.draggingId !== null}
        dropInsertBeforeId={board.dropDay === board.tomorrow ? board.dropInsertBeforeId : null}
        onDurationChange={(task, min) => void board.handleDurationChange(task, min, tomorrowDate)}
        {...columnProps}
      />
      <PlanningTaskColumn
        dayKey={board.monday}
        title={t('nordly.planning.col_next_week')}
        subtitle={t('nordly.planning.col_next_week_hint')}
        tasks={board.tasksByDay.get(board.monday) ?? []}
        durationTasks={board.columnDurationTasks(board.monday)}
        dropHighlight={board.dropDay === board.monday && board.draggingId !== null}
        dropInsertBeforeId={board.dropDay === board.monday ? board.dropInsertBeforeId : null}
        onDurationChange={(task, min) => void board.handleDurationChange(task, min, mondayDate)}
        {...columnProps}
      />
    </div>
  );
}
