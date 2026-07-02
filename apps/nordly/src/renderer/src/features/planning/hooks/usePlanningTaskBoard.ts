import { useCallback, useMemo, useState } from 'react';

import {
  createTaskConference,
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
import { useDayTaskDrag } from '@features/tasks/lib/useDayTaskDrag';
import {
  applyTimeFromDay,
  buildDefaultScheduleDate,
  defaultDurationMin,
  parseDayKey,
  resolveScheduleStart,
  taskScheduleStart,
  toDayKey,
} from '@shared/lib/dates';

import {
  findPlanningDayKey,
  nextMondayKey,
  PLANNING_POOL_DAY_KEY,
  poolDayKey,
  scheduleTargetForPool,
  tomorrowKey,
  VISIBLE_TASK_STATUSES,
} from '@features/planning/lib/planningTasks';

const VISIBLE = VISIBLE_TASK_STATUSES;

interface UsePlanningTaskBoardArgs {
  todayKey: string;
  tasks: TaskCard[];
  setTasks: React.Dispatch<React.SetStateAction<TaskCard[]>>;
  refresh: () => Promise<void>;
  onActionError: (err: unknown) => void;
}

export function usePlanningTaskBoard({
  todayKey,
  tasks,
  setTasks,
  refresh,
  onActionError,
}: UsePlanningTaskBoardArgs) {
  const [editRequest, setEditRequest] = useState<{ taskId: string; key: number } | null>(null);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);

  const tomorrow = useMemo(() => tomorrowKey(todayKey), [todayKey]);
  const monday = useMemo(() => nextMondayKey(todayKey), [todayKey]);

  const tasksByDay = useMemo(() => {
    const map = new Map<string, TaskCard[]>();
    for (const key of [todayKey, tomorrow, monday, PLANNING_POOL_DAY_KEY]) {
      map.set(key, []);
    }
    for (const task of tasks) {
      if (!VISIBLE.has(task.status)) continue;
      const key = findPlanningDayKey(task, todayKey);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(task);
    }
    for (const [, list] of map) {
      list.sort((a, b) => {
        const aDone = a.status === 'done' ? 1 : 0;
        const bDone = b.status === 'done' ? 1 : 0;
        if (aDone !== bDone) return aDone - bDone;
        const aOrder = a.order ?? taskScheduleStart(a)?.getTime() ?? new Date(a.createdAt).getTime();
        const bOrder = b.order ?? taskScheduleStart(b)?.getTime() ?? new Date(b.createdAt).getTime();
        return aOrder - bOrder;
      });
    }
    return map;
  }, [tasks, todayKey, tomorrow, monday]);

  const findTaskColumnKey = useCallback(
    (taskId: string): string | null => {
      for (const [key, list] of tasksByDay) {
        if (list.some((t) => t.id === taskId)) return key;
      }
      return null;
    },
    [tasksByDay],
  );

  const applyInsertOrder = useCallback(
    async (taskId: string, dayKey: string, insertBeforeTaskId: string | null) => {
      if (dayKey === PLANNING_POOL_DAY_KEY) return;

      let reordered: TaskCard[] = [];

      setTasks((prev) => {
        const list = prev
          .filter((t) => VISIBLE.has(t.status))
          .filter((t) => findPlanningDayKey(t, todayKey) === dayKey)
          .sort((a, b) => {
            const aDone = a.status === 'done' ? 1 : 0;
            const bDone = b.status === 'done' ? 1 : 0;
            if (aDone !== bDone) return aDone - bDone;
            const aOrder = a.order ?? taskScheduleStart(a)?.getTime() ?? new Date(a.createdAt).getTime();
            const bOrder = b.order ?? taskScheduleStart(b)?.getTime() ?? new Date(b.createdAt).getTime();
            return aOrder - bOrder;
          });

        const moved = list.find((t) => t.id === taskId);
        if (!moved) return prev;

        const without = list.filter((t) => t.id !== taskId);
        const toIdx = insertBeforeTaskId
          ? without.findIndex((t) => t.id === insertBeforeTaskId)
          : without.length;
        if (insertBeforeTaskId && toIdx === -1) return prev;

        const next = without.slice();
        next.splice(toIdx, 0, moved);
        reordered = next.map((t, i) => ({ ...t, order: i }));

        return prev.map((t) => {
          const r = reordered.find((w) => w.id === t.id);
          return r ? { ...t, order: r.order } : t;
        });
      });

      if (reordered.length === 0) return;
      try {
        await reorderTasks(reordered);
      } catch (err) {
        onActionError(err);
        void refresh();
      }
    },
    [todayKey, refresh, setTasks],
  );

  const handleMoveToDay = useCallback(
    async (taskId: string, dayKey: string, insertBeforeTaskId: string | null = null) => {
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;
      const sourceKey = findTaskColumnKey(taskId);
      if (sourceKey === dayKey) return;

      const isPool = dayKey === PLANNING_POOL_DAY_KEY;
      const scheduleDayKey = isPool ? poolDayKey(todayKey) : dayKey;

      const existing = taskScheduleStart(task);
      const resolved = isPool
        ? scheduleTargetForPool(todayKey, tasks)
        : resolveScheduleStart(
            scheduleDayKey,
            tasks,
            existing
              ? applyTimeFromDay(parseDayKey(scheduleDayKey), existing)
              : buildDefaultScheduleDate(parseDayKey(scheduleDayKey)),
            taskId,
          );
      const startIso = resolved.toISOString();
      const duration = Math.max(15, defaultDurationMin(task));

      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? { ...t, scheduledStart: startIso, scheduledDurationMin: duration }
            : t,
        ),
      );

      try {
        const updated = await scheduleTask(task.id, resolved, duration);
        setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
        if (!isPool) {
          await applyInsertOrder(taskId, scheduleDayKey, insertBeforeTaskId);
        }
        window.dispatchEvent(new CustomEvent(NORDLY_EVENTS.tasksChanged));
      } catch (err) {
        onActionError(err);
        void refresh();
      }
    },
    [tasks, todayKey, findTaskColumnKey, refresh, applyInsertOrder, setTasks],
  );

  const handleReorder = useCallback(
    async (taskId: string, dayKey: string, insertBeforeTaskId: string | null) => {
      await applyInsertOrder(taskId, dayKey, insertBeforeTaskId);
    },
    [applyInsertOrder],
  );

  const handleDrop = useCallback(
    (taskId: string, dayKey: string, insertBeforeTaskId: string | null) => {
      const sourceKey = findTaskColumnKey(taskId);
      if (sourceKey === dayKey) {
        void handleReorder(taskId, dayKey, insertBeforeTaskId);
        return;
      }
      void handleMoveToDay(taskId, dayKey, insertBeforeTaskId);
    },
    [findTaskColumnKey, handleReorder, handleMoveToDay],
  );

  const handleTaskTap = useCallback((taskId: string) => {
    setEditRequest((prev) => ({ taskId, key: (prev?.key ?? 0) + 1 }));
  }, []);

  const { draggingId, dragSourceDay, dropDay, dropInsertBeforeId, onPointerDragStart } =
    useDayTaskDrag(handleDrop, handleTaskTap);

  const draggingTask = useMemo(
    () => (draggingId ? tasks.find((t) => t.id === draggingId) ?? null : null),
    [tasks, draggingId],
  );

  const columnDurationTasks = useCallback(
    (dayKey: string): TaskCard[] => {
      const base = tasksByDay.get(dayKey) ?? [];
      if (!draggingId) return base;

      const task = tasks.find((t) => t.id === draggingId);
      if (!task) return base;

      const sourceKey = dragSourceDay ?? findTaskColumnKey(draggingId);

      if (sourceKey === dayKey && (dropDay === null || dropDay !== sourceKey)) {
        return base.filter((t) => t.id !== draggingId);
      }
      if (dropDay === dayKey && sourceKey !== dayKey && !base.some((t) => t.id === draggingId)) {
        return [...base, task];
      }
      return base;
    },
    [tasksByDay, draggingId, dragSourceDay, dropDay, tasks, findTaskColumnKey],
  );

  const handleAddTask = useCallback((dayKey: string) => {
    if (dayKey === PLANNING_POOL_DAY_KEY) return;
    window.dispatchEvent(
      new CustomEvent(NORDLY_EVENTS.openPaletteAddTask, { detail: { dayKey } }),
    );
  }, []);

  const handleToggleDone = useCallback(
    async (task: TaskCard) => {
      const next = task.status === 'done' ? 'todo' : 'done';
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: next } : t)));
      try {
        await moveTaskStatus(task.id, next);
        window.dispatchEvent(new CustomEvent(NORDLY_EVENTS.tasksChanged));
      } catch (err) {
        onActionError(err);
        void refresh();
      }
    },
    [refresh, setTasks],
  );

  const handleTitleChange = useCallback(
    async (task: TaskCard, title: string) => {
      const next = title.trim();
      if (!next || next === task.title) return;
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, title: next } : t)));
      try {
        const updated = await renameTask(task.id, next);
        setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
        window.dispatchEvent(new CustomEvent(NORDLY_EVENTS.tasksChanged));
      } catch (err) {
        onActionError(err);
        void refresh();
      }
    },
    [refresh, setTasks],
  );

  const handleDurationChange = useCallback(
    async (task: TaskCard, durationMin: number, columnDate: Date) => {
      const clamped = Math.max(15, durationMin);
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, scheduledDurationMin: clamped } : t)),
      );
      try {
        const dayKey = toDayKey(columnDate);
        const start = taskScheduleStart(task) ?? buildDefaultScheduleDate(columnDate);
        const resolved = resolveScheduleStart(dayKey, tasks, start, task.id);
        const updated = await scheduleTask(task.id, resolved, clamped);
        setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
        window.dispatchEvent(new CustomEvent(NORDLY_EVENTS.tasksChanged));
      } catch (err) {
        onActionError(err);
        void refresh();
      }
    },
    [tasks, refresh, setTasks],
  );

  const handleOpenDetail = useCallback((task: TaskCard) => {
    setDetailTaskId((prev) => (prev === task.id ? null : task.id));
  }, []);

  const handleCloseDetail = useCallback(() => {
    setDetailTaskId(null);
  }, []);

  const handleEpicChange = useCallback(
    async (task: TaskCard, selection: TaskEpicSelection) => {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id
            ? {
                ...t,
                epicId: selection && 'epicId' in selection ? selection.epicId : undefined,
                epicColor:
                  selection === null
                    ? undefined
                    : 'color' in selection
                      ? selection.color
                      : undefined,
                updatedAt: new Date().toISOString(),
              }
            : t,
        ),
      );
      try {
        const updated = await patchTaskEpic(task.id, selection);
        setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
      } catch (err) {
        onActionError(err);
        void refresh();
      }
    },
    [refresh, setTasks],
  );

  const handleCreateConference = useCallback(
    async (task: TaskCard, provider: ConferenceProvider) => {
      try {
        const updated = await createTaskConference(task.id, provider);
        setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
      } catch (err) {
        onActionError(err);
        void refresh();
      }
    },
    [refresh, setTasks, onActionError],
  );

  const handleClearConference = useCallback(
    async (task: TaskCard) => {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id
            ? {
                ...t,
                conferenceUrl: undefined,
                conferenceProvider: undefined,
                updatedAt: new Date().toISOString(),
              }
            : t,
        ),
      );
      try {
        const updated = await patchTaskDetails(task.id, { clearConference: true });
        setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
      } catch (err) {
        onActionError(err);
        void refresh();
      }
    },
    [refresh, setTasks],
  );

  return {
    tomorrow,
    monday,
    tasksByDay,
    draggingId,
    draggingTask,
    dropDay,
    dropInsertBeforeId,
    onPointerDragStart,
    columnDurationTasks,
    editRequest,
    detailTaskId,
    handleAddTask,
    handleToggleDone,
    handleTitleChange,
    handleDurationChange,
    handleOpenDetail,
    handleCloseDetail,
    handleEpicChange,
    handleCreateConference,
    handleClearConference,
  };
}
