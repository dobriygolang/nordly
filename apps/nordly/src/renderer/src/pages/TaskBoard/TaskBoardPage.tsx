import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useT } from '@nordly-i18n';

import {
  listTasks,
  moveTaskStatus,
  scheduleTask,
  renameTask,
  reorderTasks,
  patchTaskDetails,
  patchTaskEpic,
  createTaskConference,
  type TaskCard,
  type TaskEpicSelection,
  type ConferenceProvider,
} from '@features/tasks/api/tasks';
import { getTrackerSettings, type TrackerSettings } from '@features/calendar/api/calendarClient';
import { isCloudEnabled } from '@shared/model/features';
import { useSyncStore } from '@shared/model/sync';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { useTaskEpics } from '@features/tasks/lib/useTaskEpics';
import { DayColumn } from './DayColumn';
import { DayTaskDndContext } from '@features/tasks/components/DayTaskDndContext';
import { useDayTaskDnd } from '@features/tasks/lib/useDayTaskDnd';
import { useHorizontalPanScroll } from './useHorizontalPanScroll';
import { DAY_COL_GAP, useInfiniteDayScroll } from './useInfiniteDayScroll';
import { DayTimeline } from '@features/tasks/components/DayTimeline';
import {
  applyTimeFromDay,
  buildDefaultScheduleDate,
  defaultDurationMin,
  parseDayKey,
  resolveScheduleStart,
  taskDayKey,
  taskScheduleStart,
  toDayKey,
} from '@shared/lib/dates';
import { useTodayKey } from '@shared/hooks/useTodayKey';
import type { EntityNavigationRequest } from '@shared/model/navigation';

const VISIBLE = new Set(['todo', 'in_progress', 'in_review', 'done']);

function isAuthError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /\b401\b|unauthorized/i.test(message);
}

/** Stable column order — never resort by done; only explicit `order` / schedule / createdAt. */
function compareTaskColumnOrder(a: TaskCard, b: TaskCard): number {
  const aOrder = a.order ?? taskScheduleStart(a)?.getTime() ?? new Date(a.createdAt).getTime();
  const bOrder = b.order ?? taskScheduleStart(b)?.getTime() ?? new Date(b.createdAt).getTime();
  return aOrder - bOrder;
}

interface TaskBoardPageProps {
  openRequest?: EntityNavigationRequest | null;
  onConsumeOpenRequest?: (requestKey: number) => void;
}

export function TaskBoardPage({
  openRequest,
  onConsumeOpenRequest,
}: TaskBoardPageProps = {}): JSX.Element {
  const t = useT();
  const todayKey = useTodayKey();
  const today = useMemo(() => parseDayKey(todayKey), [todayKey]);
  const { days, scrollRef, showBackToToday, scrollToToday, ensureDayVisible, expandRangeForDayKeys } =
    useInfiniteDayScroll(today);
  const { epics } = useTaskEpics();
  const [tasks, setTasks] = useState<TaskCard[]>([]);
  const [tasksLoaded, setTasksLoaded] = useState(false);
  const [selectedDay, setSelectedDay] = useState(() => todayKey);
  const [editRequest, setEditRequest] = useState<{ taskId: string; key: number } | null>(null);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [trackerSettings, setTrackerSettings] = useState<TrackerSettings | null>(null);
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

  const refresh = useCallback(async () => {
    setTasks(await listTasks());
    setTasksLoaded(true);
    setLoadError(null);
  }, []);

  const failTaskAction = useCallback(
    (err: unknown) => {
      handleLoadError(err);
      void refresh();
    },
    [handleLoadError, refresh],
  );

  const loadSettings = useCallback(async () => {
    if (!isCloudEnabled()) return;
    setTrackerSettings(await getTrackerSettings());
  }, []);

  useEffect(() => {
    void refresh().catch(handleLoadError);
    void loadSettings().catch(handleLoadError);
  }, [refresh, loadSettings, handleLoadError]);

  useEffect(() => {
    const onTasksChanged = () => void refresh().catch(handleLoadError);
    const onSync = () => void refresh().catch(handleLoadError);
    window.addEventListener(NORDLY_EVENTS.tasksChanged, onTasksChanged);
    window.addEventListener(NORDLY_EVENTS.syncChanged, onSync);
    return () => {
      window.removeEventListener(NORDLY_EVENTS.tasksChanged, onTasksChanged);
      window.removeEventListener(NORDLY_EVENTS.syncChanged, onSync);
    };
  }, [refresh, handleLoadError]);

  useEffect(() => {
    if (tasks.length === 0 || didExpandTasksRef.current) return;
    didExpandTasksRef.current = true;
    const keys = tasks
      .filter((task) => VISIBLE.has(task.status))
      .map((task) => (task.scheduledStart ? taskDayKey(task) : todayKey));
    expandRangeForDayKeys(keys);
  }, [tasks, todayKey, expandRangeForDayKeys]);

  const tasksByDay = useMemo(() => {
    const map = new Map<string, TaskCard[]>();
    for (const d of days) map.set(d.key, []);
    for (const task of tasks) {
      if (!VISIBLE.has(task.status)) continue;
      const key = task.scheduledStart ? taskDayKey(task) : todayKey;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(task);
    }
    for (const [, list] of map) {
      list.sort(compareTaskColumnOrder);
    }
    return map;
  }, [tasks, days, todayKey]);

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
      let reordered: TaskCard[] = [];

      setTasks((prev) => {
        const list = prev
          .filter((t) => VISIBLE.has(t.status))
          .filter((t) => (t.scheduledStart ? taskDayKey(t) : todayKey) === dayKey)
          .sort(compareTaskColumnOrder);

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
        failTaskAction(err);
      }
    },
    [todayKey, failTaskAction],
  );

  const handleMoveToDay = useCallback(
    async (taskId: string, dayKey: string, insertBeforeTaskId: string | null = null) => {
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;
      const sourceKey = findTaskColumnKey(taskId);
      if (sourceKey === dayKey) return;

      const existing = taskScheduleStart(task);
      const start = existing
        ? applyTimeFromDay(parseDayKey(dayKey), existing)
        : buildDefaultScheduleDate(parseDayKey(dayKey));
      const resolved = resolveScheduleStart(dayKey, tasks, start, taskId);
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
        await applyInsertOrder(taskId, dayKey, insertBeforeTaskId);
      } catch (err) {
        failTaskAction(err);
      }
    },
    [tasks, findTaskColumnKey, applyInsertOrder, failTaskAction],
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
        failTaskAction(err);
      }
    },
    [failTaskAction],
  );

  const handleCreateConference = useCallback(
    async (task: TaskCard, provider: ConferenceProvider): Promise<TaskCard> => {
      try {
        const updated = await createTaskConference(task.id, provider);
        setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
        return updated;
      } catch (err) {
        failTaskAction(err);
        throw err;
      }
    },
    [failTaskAction],
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
        setTasks((prev) =>
          prev.map((t) =>
            t.id === task.id
              ? {
                  ...t,
                  conferenceUrl: task.conferenceUrl,
                  conferenceProvider: task.conferenceProvider,
                }
              : t,
          ),
        );
        failTaskAction(err);
      }
    },
    [failTaskAction],
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
      const next = task.status === 'done' ? 'todo' : 'done';
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: next } : t)));
      try {
        await moveTaskStatus(task.id, next);
      } catch (err) {
        failTaskAction(err);
      }
    },
    [failTaskAction],
  );

  const handleTitleChange = useCallback(
    async (task: TaskCard, title: string) => {
      const next = title.trim();
      if (!next || next === task.title) return;
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, title: next } : t)));
      try {
        const updated = await renameTask(task.id, next);
        setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
      } catch (err) {
        failTaskAction(err);
      }
    },
    [failTaskAction],
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
      } catch (err) {
        failTaskAction(err);
      }
    },
    [tasks, failTaskAction],
  );

  // Drag-to-reschedule from the calendar / timeline: place the task at the exact
  // dropped time (no conflict-nudging — the user is positioning it deliberately).
  const handleReschedule = useCallback(
    async (task: TaskCard, start: Date) => {
      const duration = Math.max(15, defaultDurationMin(task));
      const startIso = start.toISOString();
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id ? { ...t, scheduledStart: startIso, scheduledDurationMin: duration } : t,
        ),
      );
      try {
        const updated = await scheduleTask(task.id, start, duration);
        setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
      } catch (err) {
        failTaskAction(err);
      }
    },
    [failTaskAction],
  );

  const handleTimelineReschedule = useCallback(
    (task: TaskCard, start: Date) => {
      void handleReschedule(task, start);
    },
    [handleReschedule],
  );

  const handleTimelineDurationChange = useCallback(
    (task: TaskCard, durationMin: number) => {
      void handleDurationChange(task, durationMin, today);
    },
    [handleDurationChange, today],
  );

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

  if (loadError && !sessionReauthRequired) throw loadError;

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        padding: '0 20px 88px',
        display: 'flex',
        gap: 12,
        minHeight: 0,
        WebkitAppRegion: 'no-drag',
      }}
    >
      <div
        className="nordly-task-board-board"
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
        }}
      >
        <DayTaskDndContext dnd={dnd} epics={epics} settings={trackerSettings}>
          <div
            ref={scrollRef}
            className="nordly-hide-scrollbar nordly-task-board-scroll"
            style={{
              width: '100%',
              height: '100%',
              minHeight: 0,
              overflowX: 'auto',
              display: 'flex',
              alignItems: 'stretch',
              gap: DAY_COL_GAP,
              WebkitAppRegion: 'no-drag',
            }}
          >
            {days.map((d) => (
              <DayColumn
                key={d.key}
                dayKey={d.key}
                date={d.date}
                today={today}
                taskIds={dnd.getColumnTaskIds(d.key)}
                taskById={dnd.taskById}
                dropHighlight={dnd.overContainerId === d.key && dnd.isDragging}
                insertPreviewAt={dnd.getColumnInsertPreviewAt(d.key)}
                previewTask={dnd.activeTask}
                isDragging={dnd.isDragging}
                detailTaskId={detailTaskId}
                epics={epics}
                settings={trackerSettings}
                editRequest={editRequest}
                selected={selectedDay === d.key}
                onSelect={() => setSelectedDay(d.key)}
                onAddClick={() => openAddTask(d.key)}
                onToggleDone={(task) => void handleToggleDone(task)}
                onDurationChange={(task, min) => void handleDurationChange(task, min, d.date)}
                onTitleChange={(task, title) => void handleTitleChange(task, title)}
                onOpenDetail={handleOpenDetail}
                onCloseDetail={handleCloseDetail}
                onEpicChange={(task, selection) => void handleEpicChange(task, selection)}
                onCreateConference={handleCreateConference}
                onClearConference={(task) => void handleClearConference(task)}
                onTaskTap={handleTaskTap}
              />
            ))}
          </div>
        </DayTaskDndContext>
      </div>

      <DayTimeline
        date={today}
        tasks={tasks}
        epics={epics}
        onReschedule={handleTimelineReschedule}
        onDurationChange={handleTimelineDurationChange}
      />

      {showBackToToday && (
        <div className="nordly-back-to-today-anchor">
          <button
            type="button"
            onClick={handleBackToToday}
            className="mono fadein nordly-pill-btn"
            aria-label={t('nordly.taskboard.back_to_today')}
            style={{ fontSize: 11, WebkitAppRegion: 'no-drag' }}
          >
            {t('nordly.taskboard.back_to_today')}
          </button>
        </div>
      )}
    </div>
  );
}
