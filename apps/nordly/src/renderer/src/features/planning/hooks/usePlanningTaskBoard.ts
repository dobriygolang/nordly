import { useCallback, useMemo, useState } from 'react';

import {
  createTaskConference,
  deleteTask,
  moveTaskStatus,
  patchTaskDetails,
  patchTaskEpic,
  renameTask,
  reorderTasks,
  scheduleTask,
  type ConferenceProvider,
  type TaskCard,
  type TaskEpicSelection,
} from '@features/tasks/api/tasks';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { useDayTaskDnd } from '@features/tasks/hooks/useDayTaskDnd';
import type { TaskMutationCoordinator } from '@features/tasks/lib/optimisticTasks';
import {
  compareTaskDayOrder,
  mergeTaskColumnOrder,
  reorderTaskColumn,
} from '@features/tasks/lib/taskOrder';
import {
  taskDurationMin,
} from '@features/tasks/model/duration';
import { resolveTaskDurationSchedule } from '@features/tasks/lib/taskScheduling';
import {
  isTaskDone,
  nextTaskCompletionStatus,
} from '@features/tasks/model/status';
import {
  applyTimeFromDay,
  buildDefaultScheduleDate,
  parseDayKey,
  resolveScheduleStart,
  scheduleStartISO,
  taskScheduleStart,
} from '@shared/lib/dates';

import {
  buildPlanningPool,
  findPlanningDayKey,
  nextWeekStartKey,
  planningColumnKeys,
  PLANNING_POOL_DAY_KEY,
  tomorrowKey,
  VISIBLE_TASK_STATUSES,
} from '@features/planning/lib/planningTasks';

const VISIBLE = VISIBLE_TASK_STATUSES;

interface UsePlanningTaskBoardArgs {
  todayKey: string;
  tasks: TaskCard[];
  coordinator: TaskMutationCoordinator;
  onActionError: (err: unknown) => void;
  /**
   * True while the step renders only Today + the pool (Pick): tomorrow and next week
   * have no column of their own there, so their tasks must fold into the pool.
   */
  poolAbsorbsNearDays: boolean;
}

export function usePlanningTaskBoard({
  todayKey,
  tasks,
  coordinator,
  onActionError,
  poolAbsorbsNearDays,
}: UsePlanningTaskBoardArgs) {
  const [editRequest, setEditRequest] = useState<{ taskId: string; key: number } | null>(null);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [poolExtraWeeks, setPoolExtraWeeks] = useState(0);

  const tomorrow = useMemo(() => tomorrowKey(todayKey), [todayKey]);
  const nextWeek = useMemo(() => nextWeekStartKey(todayKey), [todayKey]);

  const pool = useMemo(
    () =>
      buildPlanningPool(tasks, todayKey, {
        extraWeeks: poolExtraWeeks,
        poolAbsorbsNearDays,
      }),
    [tasks, todayKey, poolExtraWeeks, poolAbsorbsNearDays],
  );

  const tasksByDay = useMemo(() => {
    const map = new Map<string, TaskCard[]>();
    const dayKeys = planningColumnKeys(todayKey, poolAbsorbsNearDays);
    for (const key of dayKeys) map.set(key, []);

    for (const task of tasks) {
      if (!VISIBLE.has(task.status)) continue;
      const key = findPlanningDayKey(task, todayKey, poolAbsorbsNearDays);
      // The pool is a date window, not a bucket — buildPlanningPool owns its contents.
      if (key === null || key === PLANNING_POOL_DAY_KEY) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(task);
    }
    for (const [, list] of map) {
      list.sort(compareTaskDayOrder);
    }

    if (poolAbsorbsNearDays) {
      map.set(PLANNING_POOL_DAY_KEY, pool.tasks);
    }
    return map;
  }, [tasks, todayKey, pool, poolAbsorbsNearDays]);

  const applyInsertOrder = useCallback(
    async (taskId: string, dayKey: string, insertBeforeTaskId: string | null) => {
      if (dayKey === PLANNING_POOL_DAY_KEY) return;

      const current = coordinator.getTasks();
      const columnTasks = current
        .filter((task) => VISIBLE.has(task.status))
        .filter(
          (task) =>
            findPlanningDayKey(task, todayKey, poolAbsorbsNearDays) === dayKey,
        );
      const reordered = reorderTaskColumn(
        columnTasks,
        taskId,
        insertBeforeTaskId,
      );
      if (!reordered) return;

      await coordinator.mutate({
        optimistic: (latest) => mergeTaskColumnOrder(latest, reordered),
        persist: () => reorderTasks(reordered),
        onError: onActionError,
      });
    },
    [todayKey, poolAbsorbsNearDays, coordinator, onActionError],
  );

  const handleMoveToDay = useCallback(
    async (taskId: string, dayKey: string, insertBeforeTaskId: string | null = null) => {
      const current = coordinator.getTasks();
      const task = current.find((candidate) => candidate.id === taskId);
      if (!task) return;
      const sourceKey = findPlanningDayKey(
        task,
        todayKey,
        poolAbsorbsNearDays,
      );
      if (sourceKey === dayKey) return;

      const isPool = dayKey === PLANNING_POOL_DAY_KEY;
      // Dropping into the pool means "not today". With no dateless state in the model,
      // the only non-arbitrary target is the nearest other day — tomorrow. (The old
      // behaviour invented a day two-plus days out, which nothing in the UI implied.)
      const scheduleDayKey = isPool ? tomorrow : dayKey;

      const existing = taskScheduleStart(task);
      const resolved = resolveScheduleStart(
        scheduleDayKey,
        current,
        existing
          ? applyTimeFromDay(parseDayKey(scheduleDayKey), existing)
          : buildDefaultScheduleDate(parseDayKey(scheduleDayKey)),
        taskId,
      );
      const startIso = scheduleStartISO(resolved);
      const duration = taskDurationMin(task);
      const scheduledTasks = current.map((candidate) =>
        candidate.id === taskId
          ? {
              ...candidate,
              scheduledStart: startIso,
              scheduledDurationMin: duration,
            }
          : candidate,
      );
      const targetTasks = isPool
        ? []
        : scheduledTasks
            .filter((candidate) => VISIBLE.has(candidate.status))
            .filter(
              (candidate) =>
                findPlanningDayKey(
                  candidate,
                  todayKey,
                  poolAbsorbsNearDays,
                ) === scheduleDayKey,
            );
      const reordered = isPool
        ? null
        : reorderTaskColumn(targetTasks, taskId, insertBeforeTaskId);
      const optimisticTasks = reordered
        ? mergeTaskColumnOrder(scheduledTasks, reordered)
        : scheduledTasks;

      await coordinator.mutate({
        optimistic: () => optimisticTasks,
        persist: async () => {
          const updated = await scheduleTask(task.id, resolved, duration);
          if (!reordered) return updated;

          const persistedOrder = reordered.map((candidate) =>
            candidate.id === task.id
              ? { ...updated, order: candidate.order }
              : candidate,
          );
          await reorderTasks(persistedOrder);
          const persistedTask = persistedOrder.find(
            (candidate) => candidate.id === updated.id,
          );
          if (!persistedTask) {
            throw new Error(`Reordered task missing after schedule: ${updated.id}`);
          }
          return persistedTask;
        },
        commit: (latest, updated) =>
          latest.map((candidate) =>
            candidate.id === task.id ? updated : candidate,
          ),
        onError: onActionError,
      });
    },
    [
      coordinator,
      todayKey,
      poolAbsorbsNearDays,
      tomorrow,
      onActionError,
    ],
  );

  const handleReorder = useCallback(
    async (taskId: string, dayKey: string, insertBeforeTaskId: string | null) => {
      await applyInsertOrder(taskId, dayKey, insertBeforeTaskId);
    },
    [applyInsertOrder],
  );

  const handleDrop = useCallback(
    (taskId: string, dayKey: string, insertBeforeTaskId: string | null) => {
      const task = coordinator
        .getTasks()
        .find((candidate) => candidate.id === taskId);
      if (!task) return;
      const sourceKey = findPlanningDayKey(
        task,
        todayKey,
        poolAbsorbsNearDays,
      );
      if (sourceKey === dayKey) {
        void handleReorder(taskId, dayKey, insertBeforeTaskId);
        return;
      }
      void handleMoveToDay(taskId, dayKey, insertBeforeTaskId);
    },
    [
      coordinator,
      todayKey,
      poolAbsorbsNearDays,
      handleReorder,
      handleMoveToDay,
    ],
  );

  const handleTaskTap = useCallback((taskId: string) => {
    setEditRequest((prev) => ({ taskId, key: (prev?.key ?? 0) + 1 }));
  }, []);

  const columnKeys = useMemo(
    () => planningColumnKeys(todayKey, poolAbsorbsNearDays),
    [todayKey, poolAbsorbsNearDays],
  );

  const extendPool = useCallback(() => {
    setPoolExtraWeeks(pool.weeksAhead + 1);
  }, [pool.weeksAhead]);

  const dnd = useDayTaskDnd({
    columnKeys,
    tasksByDay,
    tasks,
    onDrop: handleDrop,
  });

  const handleAddTask = useCallback((dayKey: string) => {
    if (dayKey === PLANNING_POOL_DAY_KEY) return;
    window.dispatchEvent(
      new CustomEvent(NORDLY_EVENTS.openPaletteAddTask, { detail: { dayKey } }),
    );
  }, []);

  const handleToggleDone = useCallback(
    async (task: TaskCard) => {
      const currentTask =
        coordinator.getTasks().find((candidate) => candidate.id === task.id) ??
        task;
      const next = nextTaskCompletionStatus(currentTask.status);
      const now = new Date().toISOString();
      await coordinator.mutate({
        optimistic: (current) =>
          current.map((candidate) =>
            candidate.id === task.id
              ? {
                  ...candidate,
                  status: next,
                  completedAt: isTaskDone(next) ? now : undefined,
                  updatedAt: now,
                }
              : candidate,
          ),
        persist: () => moveTaskStatus(task.id, next),
        commit: (current, updated) =>
          current.map((candidate) =>
            candidate.id === task.id ? updated : candidate,
          ),
        onError: onActionError,
      });
    },
    [coordinator, onActionError],
  );

  const handleTitleChange = useCallback(
    async (task: TaskCard, title: string) => {
      const next = title.trim();
      if (!next || next === task.title) return;
      await coordinator.mutate({
        optimistic: (current) =>
          current.map((candidate) =>
            candidate.id === task.id
              ? {
                  ...candidate,
                  title: next,
                  updatedAt: new Date().toISOString(),
                }
              : candidate,
          ),
        persist: () => renameTask(task.id, next),
        commit: (current, updated) =>
          current.map((candidate) =>
            candidate.id === task.id ? updated : candidate,
          ),
        onError: onActionError,
      });
    },
    [coordinator, onActionError],
  );

  const handleDurationChange = useCallback(
    async (task: TaskCard, durationMin: number) => {
      const current = coordinator.getTasks();
      const currentTask =
        current.find((candidate) => candidate.id === task.id) ?? task;
      const resolved = resolveTaskDurationSchedule(
        currentTask,
        current,
        todayKey,
        durationMin,
      );

      await coordinator.mutate({
        optimistic: (latest) =>
          latest.map((candidate) =>
            candidate.id === task.id
              ? {
                  ...candidate,
                  scheduledStart: resolved.startIso,
                  scheduledDurationMin: resolved.durationMin,
                  updatedAt: new Date().toISOString(),
                }
              : candidate,
          ),
        persist: () =>
          scheduleTask(task.id, resolved.start, resolved.durationMin),
        commit: (latest, updated) =>
          latest.map((candidate) =>
            candidate.id === task.id ? updated : candidate,
          ),
        onError: onActionError,
      });
    },
    [coordinator, todayKey, onActionError],
  );

  const handleReschedule = useCallback(
    async (task: TaskCard, start: Date) => {
      const currentTask =
        coordinator.getTasks().find((candidate) => candidate.id === task.id) ??
        task;
      const duration = taskDurationMin(currentTask);
      const startIso = scheduleStartISO(start);
      await coordinator.mutate({
        optimistic: (current) =>
          current.map((candidate) =>
            candidate.id === task.id
              ? {
                  ...candidate,
                  scheduledStart: startIso,
                  scheduledDurationMin: duration,
                  updatedAt: new Date().toISOString(),
                }
              : candidate,
          ),
        persist: () => scheduleTask(task.id, start, duration),
        commit: (current, updated) =>
          current.map((candidate) =>
            candidate.id === task.id ? updated : candidate,
          ),
        onError: onActionError,
      });
    },
    [coordinator, onActionError],
  );

  const handleOpenDetail = useCallback((task: TaskCard) => {
    setDetailTaskId((prev) => (prev === task.id ? null : task.id));
  }, []);

  const handleCloseDetail = useCallback(() => {
    setDetailTaskId(null);
  }, []);

  const handleEpicChange = useCallback(
    async (task: TaskCard, selection: TaskEpicSelection) => {
      await coordinator.mutate({
        optimistic: (current) =>
          current.map((candidate) =>
            candidate.id === task.id
              ? {
                  ...candidate,
                  epicId:
                    selection && 'epicId' in selection
                      ? selection.epicId
                      : undefined,
                  epicColor:
                    selection === null
                      ? undefined
                      : 'color' in selection
                        ? selection.color
                        : undefined,
                  updatedAt: new Date().toISOString(),
                }
              : candidate,
          ),
        persist: () => patchTaskEpic(task.id, selection),
        commit: (current, updated) =>
          current.map((candidate) =>
            candidate.id === task.id ? updated : candidate,
          ),
        onError: onActionError,
      });
    },
    [coordinator, onActionError],
  );

  const handleCreateConference = useCallback(
    async (task: TaskCard, provider: ConferenceProvider): Promise<TaskCard> => {
      const updated = await coordinator.mutate({
        optimistic: (current) => current,
        persist: () => createTaskConference(task.id, provider),
        commit: (current, result) =>
          current.map((candidate) =>
            candidate.id === task.id ? result : candidate,
          ),
        onError: onActionError,
        throwOnError: true,
      });
      if (!updated) throw new Error(`Task conference missing result: ${task.id}`);
      return updated;
    },
    [coordinator, onActionError],
  );

  const handleClearConference = useCallback(
    async (task: TaskCard) => {
      await coordinator.mutate({
        optimistic: (current) =>
          current.map((candidate) =>
            candidate.id === task.id
              ? {
                  ...candidate,
                  conferenceUrl: undefined,
                  conferenceProvider: undefined,
                  googleEventId: undefined,
                  googleCalendarId: undefined,
                  zoomMeetingId: undefined,
                  updatedAt: new Date().toISOString(),
                }
              : candidate,
          ),
        persist: () => patchTaskDetails(task.id, { clearConference: true }),
        commit: (current, updated) =>
          current.map((candidate) =>
            candidate.id === task.id ? updated : candidate,
          ),
        onError: onActionError,
      });
    },
    [coordinator, onActionError],
  );

  const handleDeleteTask = useCallback(
    async (task: TaskCard) => {
      setDetailTaskId((prev) => (prev === task.id ? null : prev));
      await coordinator.mutate({
        optimistic: (current) =>
          current.filter((candidate) => candidate.id !== task.id),
        persist: () => deleteTask(task.id),
        onError: onActionError,
      });
    },
    [coordinator, onActionError],
  );

  return {
    tomorrow,
    nextWeek,
    pool,
    extendPool,
    tasksByDay,
    dnd,
    handleTaskTap,
    editRequest,
    detailTaskId,
    handleAddTask,
    handleToggleDone,
    handleTitleChange,
    handleDurationChange,
    handleReschedule,
    handleOpenDetail,
    handleCloseDetail,
    handleEpicChange,
    handleCreateConference,
    handleClearConference,
    handleDeleteTask,
  };
}
