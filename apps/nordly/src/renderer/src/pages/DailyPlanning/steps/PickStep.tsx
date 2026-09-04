import { useLocale, useT } from '@nordly-i18n';

import type { TaskCard } from '@features/tasks/api/tasks';
import type { TaskEpic } from '@features/tasks/api/epics';
import type { TrackerSettings } from '@features/calendar/api/calendarClient';
import { formatWhenChip, parseDayKey } from '@shared/lib/dates';

import { DayTaskDndContext } from '@features/tasks/components/DayTaskDndContext';
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
  const [locale] = useLocale();
  const { dnd, pool } = board;

  // The pool is a date window, so name the range it covers instead of "from all your
  // lists" — otherwise a shrunken column reads as missing tasks.
  const windowEndLabel = formatWhenChip(parseDayKey(pool.windowEndKey), locale);
  const poolSubtitle =
    pool.overdueCount > 0
      ? t('nordly.planning.col_all_hint_overdue', {
          count: pool.overdueCount,
          date: windowEndLabel,
        })
      : t('nordly.planning.col_all_hint_window', { date: windowEndLabel });

  const poolFooter =
    pool.nextHiddenKey === null ? null : (
      <button
        type="button"
        className="nordly-planning-pool-more"
        onClick={board.extendPool}
        style={{ pointerEvents: dnd.isDragging ? 'none' : 'auto' }}
      >
        {t('nordly.planning.col_all_more', {
          count: pool.hiddenCount,
          date: formatWhenChip(parseDayKey(pool.nextHiddenKey), locale),
        })}
      </button>
    );

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
  };

  return (
    <DayTaskDndContext dnd={dnd} epics={epics} settings={settings}>
      <div className="nordly-planning-cols" data-cols="2">
        <PlanningTaskColumn
          dayKey={todayKey}
          title={t('nordly.planning.col_today')}
          subtitle={t('nordly.planning.col_today_hint')}
          taskIds={dnd.getColumnTaskIds(todayKey)}
          taskById={dnd.taskById}
          dropHighlight={dnd.overContainerId === todayKey && dnd.isDragging}
          insertPreviewAt={dnd.getColumnInsertPreviewAt(todayKey)}
          showAdd
          onAddClick={() => void board.handleAddTask(todayKey)}
          onDurationChange={(task, min) => void board.handleDurationChange(task, min)}
          {...columnProps}
        />
        <PlanningTaskColumn
          dayKey={PLANNING_POOL_DAY_KEY}
          title={t('nordly.planning.col_all_tasks')}
          subtitle={poolSubtitle}
          taskIds={dnd.getColumnTaskIds(PLANNING_POOL_DAY_KEY)}
          taskById={dnd.taskById}
          dropHighlight={dnd.overContainerId === PLANNING_POOL_DAY_KEY && dnd.isDragging}
          insertPreviewAt={dnd.getColumnInsertPreviewAt(PLANNING_POOL_DAY_KEY)}
          footer={poolFooter}
          onAddClick={() => undefined}
          onDurationChange={(task, min) => void board.handleDurationChange(task, min)}
          {...columnProps}
        />
      </div>
    </DayTaskDndContext>
  );
}
