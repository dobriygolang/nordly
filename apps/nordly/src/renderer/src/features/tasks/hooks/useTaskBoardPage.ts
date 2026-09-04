import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useCalendarEditor } from '@features/calendar/hooks/useCalendarEditor';
import { useTrackerSettings } from '@features/calendar/lib/useTrackerSettings';
import { clampScheduleToDayGrid } from '@features/calendar/lib/events';
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
import { useDayTaskDnd } from '@features/tasks/hooks/useDayTaskDnd';
import { useHorizontalPanScroll } from '@features/tasks/hooks/useHorizontalPanScroll';
import { useInfiniteDayScroll } from '@features/tasks/hooks/useInfiniteDayScroll';
import { useTaskEpics } from '@features/tasks/hooks/useTaskEpics';
import { useTaskMutationCoordinator } from '@features/tasks/hooks/useTaskMutationCoordinator';
import { isAuthError, isRecoverableTaskActionError } from '@features/tasks/lib/taskActionErrors';
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
  VISIBLE_TASK_STATUSES,
} from '@features/tasks/model/status';
import { useTodayKey } from '@shared/hooks/useTodayKey';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import {
  applyTimeFromDay,
  buildDefaultScheduleDate,
  parseDayKey,
  resolveScheduleStart,
  scheduleStartISO,
  taskDayKey,
  taskScheduleStart,
} from '@shared/lib/dates';
import type { EntityNavigationRequest } from '@shared/model/navigation';
import { useSyncStore } from '@shared/model/sync';

export function useTaskBoardPage(options: {
  openRequest?: EntityNavigationRequest | null;
  onConsumeOpenRequest?: (requestKey: number) => void;
}) {
  const { openRequest, onConsumeOpenRequest } = options;
  const todayKey = useTodayKey();
  const today = useMemo(() => parseDayKey(todayKey), [todayKey]);
  const {
    days,
    visibleRange,
    scrollRef,
    showBackToToday,
    scrollToToday,
    ensureDayVisible,
    expandRangeForDayKeys,
  } = useInfiniteDayScroll(today);
  const { epics } = useTaskEpics();
  const [tasks, setTasks] = useState<TaskCard[]>([]);
  const [tasksLoaded, setTasksLoaded] = useState(false);
  const [selectedDay, setSelectedDay] = useState(() => todayKey);
  const [editRequest, setEditRequest] = useState<{ taskId: string; key: number } | null>(null);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const { settings: trackerSettings } = useTrackerSettings();
  const [loadError, setLoadError] = useState<Error | null>(null);
  const sessionReauthRequired = useSyncStore((s) => s.sessionReauthRequired);
  const didExpandTasksRef = useRef(false);
  const previousTodayKeyRef = useRef(todayKey);

  useEffect(() => {
    const previousTodayKey = previousTodayKeyRef.current;
    previousTodayKeyRef.current = todayKey;
    setSelectedDay((current) => (current === previousTodayKey ? todayKey : current));
  }, [todayKey]);

  const handleLoadError = useCallback((err: unknown) => {
    if (isAuthError(err) || useSyncStore.getState().sessionReauthRequired) {
      useSyncStore.getState().setSessionReauthRequired(true);
      setLoadError(null);
      return;
    }
    setLoadError(err instanceof Error ? err : new Error(String(err)));
  }, []);

  const coordinator = useTaskMutationCoordinator({
    tasks,
    setTasks,
    onHydrationError: handleLoadError,
    onHydrated: () => {
      setTasksLoaded(true);
      setLoadError(null);
    },
  });

  const refresh = useCallback(
    () => coordinator.requestHydration(),
    [coordinator],
  );

  const failTaskAction = useCallback(
    (err: unknown) => {
      if (isRecoverableTaskActionError(err)) {
        return;
      }
      handleLoadError(err);
    },
    [handleLoadError],
  );

  useEffect(() => {
    void refresh().catch(handleLoadError);
  }, [refresh, handleLoadError]);

  useEffect(() => {
    const hydrateFromIdb = () => {
      void coordinator.requestHydration();
    };
    const onTasksChanged = () => hydrateFromIdb();
    const onSync = () => hydrateFromIdb();
    window.addEventListener(NORDLY_EVENTS.tasksChanged, onTasksChanged);
    window.addEventListener(NORDLY_EVENTS.syncChanged, onSync);
    return () => {
      window.removeEventListener(NORDLY_EVENTS.tasksChanged, onTasksChanged);
      window.removeEventListener(NORDLY_EVENTS.syncChanged, onSync);
    };
  }, [coordinator]);

  useEffect(() => {
    if (tasks.length === 0 || didExpandTasksRef.current) return;
    didExpandTasksRef.current = true;
    const keys = tasks
      .filter((task) => VISIBLE_TASK_STATUSES.has(task.status))
      .map((task) => (task.scheduledStart ? taskDayKey(task) : todayKey));
    expandRangeForDayKeys(keys);
  }, [tasks, todayKey, expandRangeForDayKeys]);

  const tasksByDay = useMemo(() => {
    const map = new Map<string, TaskCard[]>();
    for (const d of days) map.set(d.key, []);
    for (const task of tasks) {
      if (!VISIBLE_TASK_STATUSES.has(task.status)) continue;
      const key = task.scheduledStart ? taskDayKey(task) : todayKey;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(task);
    }
    for (const [, list] of map) {
      list.sort(compareTaskDayOrder);
    }
    return map;
  }, [tasks, days, todayKey]);

  const applyInsertOrder = useCallback(
    async (taskId: string, dayKey: string, insertBeforeTaskId: string | null) => {
      const current = coordinator.getTasks();
      const columnTasks = current
        .filter((task) => VISIBLE_TASK_STATUSES.has(task.status))
        .filter(
          (task) =>
            (task.scheduledStart ? taskDayKey(task) : todayKey) === dayKey,
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
        onError: failTaskAction,
      });
    },
    [coordinator, todayKey, failTaskAction],
  );

  const handleMoveToDay = useCallback(
    async (taskId: string, dayKey: string, insertBeforeTaskId: string | null = null) => {
      const current = coordinator.getTasks();
      const task = current.find((candidate) => candidate.id === taskId);
      if (!task) return;
      const sourceKey = task.scheduledStart ? taskDayKey(task) : todayKey;
      if (sourceKey === dayKey) return;

      const existing = taskScheduleStart(task);
      const rawStart = existing
        ? applyTimeFromDay(parseDayKey(dayKey), existing)
        : buildDefaultScheduleDate(parseDayKey(dayKey));
      const start = clampScheduleToDayGrid(dayKey, rawStart);
      const resolved = resolveScheduleStart(dayKey, current, start, taskId);
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
      const targetTasks = scheduledTasks
        .filter((candidate) => VISIBLE_TASK_STATUSES.has(candidate.status))
        .filter(
          (candidate) =>
            (candidate.scheduledStart ? taskDayKey(candidate) : todayKey) ===
            dayKey,
        );
      const reordered = reorderTaskColumn(
        targetTasks,
        taskId,
        insertBeforeTaskId,
      );
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
        onError: failTaskAction,
      });
    },
    [coordinator, todayKey, failTaskAction],
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
      const sourceKey = task.scheduledStart ? taskDayKey(task) : todayKey;
      if (sourceKey === dayKey) {
        void handleReorder(taskId, dayKey, insertBeforeTaskId);
        return;
      }
      void handleMoveToDay(taskId, dayKey, insertBeforeTaskId);
    },
    [coordinator, todayKey, handleReorder, handleMoveToDay],
  );

  const handleTaskTap = useCallback((taskId: string) => {
    setEditRequest((prev) => ({ taskId, key: (prev?.key ?? 0) + 1 }));
  }, []);

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
                epicId: selection && 'epicId' in selection ? selection.epicId : undefined,
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
        onError: failTaskAction,
      });
    },
    [coordinator, failTaskAction],
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
        onError: failTaskAction,
        throwOnError: true,
      });
      if (!updated) throw new Error(`Task conference missing result: ${task.id}`);
      return updated;
    },
    [coordinator, failTaskAction],
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
        onError: failTaskAction,
      });
    },
    [coordinator, failTaskAction],
  );

  const columnKeys = useMemo(() => days.map((d) => d.key), [days]);

  const dnd = useDayTaskDnd({
    columnKeys,
    tasksByDay,
    tasks,
    onDrop: handleDrop,
    scrollContainerRef: scrollRef,
  });

  useHorizontalPanScroll(scrollRef, !dnd.isDragging);

  const openAddTask = useCallback((dayKey: string) => {
    window.dispatchEvent(
      new CustomEvent(NORDLY_EVENTS.openPaletteAddTask, { detail: { dayKey } }),
    );
  }, []);

  const handleToggleDone = useCallback(
    async (task: TaskCard) => {
      const currentTask =
        coordinator.getTasks().find((candidate) => candidate.id === task.id) ?? task;
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
        onError: failTaskAction,
      });
    },
    [coordinator, failTaskAction],
  );

  const handleDeleteTask = useCallback(
    async (task: TaskCard) => {
      setDetailTaskId((prev) => (prev === task.id ? null : prev));
      await coordinator.mutate({
        optimistic: (current) =>
          current.filter((candidate) => candidate.id !== task.id),
        persist: () => deleteTask(task.id),
        onError: failTaskAction,
      });
    },
    [coordinator, failTaskAction],
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
        onError: failTaskAction,
      });
    },
    [coordinator, failTaskAction],
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
        onError: failTaskAction,
      });
    },
    [coordinator, todayKey, failTaskAction],
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
        onError: failTaskAction,
      });
    },
    [coordinator, failTaskAction],
  );

  const {
    editor: createEditor,
    saving: createSaving,
    openTaskRange,
    setTitle: setCreateTitle,
    close: closeCreateEditor,
    save: saveCreateEditor,
    deleteEvent: deleteCreateEditor,
  } = useCalendarEditor({
    refreshTasks: refresh,
    onError: failTaskAction,
    onGoogleError: failTaskAction,
  });

  const handleBackToToday = useCallback(() => {
    scrollToToday();
    setSelectedDay(todayKey);
  }, [scrollToToday, todayKey]);

  useEffect(() => {
    if (!openRequest || !tasksLoaded) return;
    const task = tasks.find((item) => item.id === openRequest.id);
    if (task) {
      const key = task.scheduledStart ? taskDayKey(task) : todayKey;
      setSelectedDay(key);
      ensureDayVisible(key);
      setEditRequest((prev) => ({
        taskId: task.id,
        key: (prev?.key ?? 0) + 1,
      }));
    }
    onConsumeOpenRequest?.(openRequest.requestKey);
  }, [openRequest, tasksLoaded, tasks, todayKey, ensureDayVisible, onConsumeOpenRequest]);

  return {
    today,
    todayKey,
    days,
    visibleRange,
    scrollRef,
    showBackToToday,
    selectedDay,
    setSelectedDay,
    editRequest,
    detailTaskId,
    trackerSettings,
    loadError,
    sessionReauthRequired,
    epics,
    tasks,
    dnd,
    createEditor,
    createSaving,
    setCreateTitle,
    closeCreateEditor,
    saveCreateEditor,
    deleteCreateEditor,
    openTaskRange,
    handleBackToToday,
    openAddTask,
    handleToggleDone,
    handleDurationChange,
    handleTitleChange,
    handleOpenDetail,
    handleCloseDetail,
    handleEpicChange,
    handleCreateConference,
    handleClearConference,
    handleDeleteTask,
    handleTaskTap,
    handleReschedule,
  };
}
