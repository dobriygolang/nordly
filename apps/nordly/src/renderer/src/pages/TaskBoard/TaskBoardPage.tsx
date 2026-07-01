import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useT } from '@nordly-i18n';

import {
  listTasks,
  moveTaskStatus,
  scheduleTask,
  renameTask,
  reorderTasks,
  patchTaskDetails,
  patchTaskEpicColor,
  createTaskConference,
  type TaskCard,
  type ConferenceProvider,
} from '@features/tasks/api/tasks';
import { getTrackerSettings, type TrackerSettings } from '@features/calendar/api/calendarClient';
import { LOCAL_ONLY } from '@app/config/features';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { DayColumn } from './DayColumn';
import { useDayTaskDrag } from './useDayTaskDrag';
import { useHorizontalPanScroll } from './useHorizontalPanScroll';
import { useInfiniteDayScroll } from './useInfiniteDayScroll';
import { DayTimeline } from './DayTimeline';
import {
  applyTimeFromDay,
  buildDefaultScheduleDate,
  defaultDurationMin,
  parseDayKey,
  resolveScheduleStart,
  taskDayKey,
  taskScheduleStart,
  toDayKey,
} from './lib/dates';

const VISIBLE = new Set(['todo', 'in_progress', 'in_review', 'done']);

export function TaskBoardPage(): JSX.Element {
  const t = useT();
  const today = useMemo(() => new Date(), []);
  const todayKey = toDayKey(today);
  const { days, scrollRef, showBackToToday, scrollToToday, ensureDayVisible, expandRangeForDayKeys } =
    useInfiniteDayScroll(today);
  const [tasks, setTasks] = useState<TaskCard[]>([]);
  const [selectedDay, setSelectedDay] = useState(() => todayKey);
  const [editRequest, setEditRequest] = useState<{ taskId: string; key: number } | null>(null);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [trackerSettings, setTrackerSettings] = useState<TrackerSettings | null>(null);
  const didExpandTasksRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      setTasks(await listTasks());
    } catch {
      /* keep stale list */
    }
  }, []);

  const loadSettings = useCallback(async () => {
    if (LOCAL_ONLY) return;
    try {
      setTrackerSettings(await getTrackerSettings());
    } catch {
      setTrackerSettings(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
    void loadSettings();
  }, [refresh, loadSettings]);

  useEffect(() => {
    const onTasksChanged = () => void refresh();
    const onSync = () => void refresh();
    window.addEventListener(NORDLY_EVENTS.tasksChanged, onTasksChanged);
    window.addEventListener(NORDLY_EVENTS.syncChanged, onSync);
    return () => {
      window.removeEventListener(NORDLY_EVENTS.tasksChanged, onTasksChanged);
      window.removeEventListener(NORDLY_EVENTS.syncChanged, onSync);
    };
  }, [refresh]);

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
  }, [tasks, days, todayKey]);

  const selectedDate = useMemo(
    () => days.find((d) => d.key === selectedDay)?.date ?? today,
    [days, selectedDay, today],
  );

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
      } catch {
        void refresh();
      }
    },
    [todayKey, refresh],
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
      setSelectedDay(dayKey);

      try {
        const updated = await scheduleTask(task.id, resolved, duration);
        setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
        await applyInsertOrder(taskId, dayKey, insertBeforeTaskId);
      } catch {
        void refresh();
      }
    },
    [tasks, findTaskColumnKey, refresh, applyInsertOrder],
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

  const handleEpicColorChange = useCallback(
    async (task: TaskCard, epicColor: string | null) => {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id
            ? { ...t, epicColor: epicColor ?? undefined, updatedAt: new Date().toISOString() }
            : t,
        ),
      );
      try {
        const updated = await patchTaskEpicColor(task.id, epicColor);
        setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
      } catch {
        void refresh();
      }
    },
    [refresh],
  );

  const handleCreateConference = useCallback(
    async (task: TaskCard, provider: ConferenceProvider) => {
      const updated = await createTaskConference(task.id, provider);
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
    },
    [],
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
      } catch {
        void refresh();
      }
    },
    [refresh],
  );

  const { draggingId, dragSourceDay, dropDay, dropInsertBeforeId, onPointerDragStart } =
    useDayTaskDrag(handleDrop, handleTaskTap);

  const draggingTask = useMemo(
    () => (draggingId ? tasks.find((t) => t.id === draggingId) ?? null : null),
    [tasks, draggingId],
  );

  useHorizontalPanScroll(scrollRef, draggingId === null);

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
      } catch {
        void refresh();
      }
    },
    [refresh],
  );

  const handleTitleChange = useCallback(
    async (task: TaskCard, title: string) => {
      const next = title.trim();
      if (!next || next === task.title) return;
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, title: next } : t)));
      try {
        const updated = await renameTask(task.id, next);
        setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
      } catch {
        void refresh();
      }
    },
    [refresh],
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
      } catch {
        void refresh();
      }
    },
    [tasks, refresh],
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
      } catch {
        void refresh();
      }
    },
    [refresh],
  );

  const handleBackToToday = useCallback(() => {
    scrollToToday();
    setSelectedDay(todayKey);
  }, [scrollToToday, todayKey]);

  useEffect(() => {
    const onOpen = (e: Event): void => {
      const taskId = (e as CustomEvent<{ taskId?: string }>).detail?.taskId;
      if (!taskId) return;
      const task = tasks.find((item) => item.id === taskId);
      if (!task) return;
      const key = taskDayKey(task);
      setSelectedDay(key);
      ensureDayVisible(key);
    };
    window.addEventListener(NORDLY_EVENTS.openTask, onOpen);
    return () => window.removeEventListener(NORDLY_EVENTS.openTask, onOpen);
  }, [tasks, ensureDayVisible]);

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
            gap: 10,
            WebkitAppRegion: 'no-drag',
          }}
        >
          {days.map((d) => (
            <DayColumn
              key={d.key}
              dayKey={d.key}
              date={d.date}
              today={today}
              draggingId={draggingId}
              draggingTask={draggingTask}
              dropHighlight={dropDay === d.key && draggingId !== null}
              dropInsertBeforeId={dropDay === d.key ? dropInsertBeforeId : null}
              detailTaskId={detailTaskId}
              settings={trackerSettings}
              editRequest={editRequest}
              durationTasks={columnDurationTasks(d.key)}
              tasks={tasksByDay.get(d.key) ?? []}
              selected={selectedDay === d.key}
              onSelect={() => setSelectedDay(d.key)}
              onAddClick={() => openAddTask(d.key)}
              onToggleDone={(task) => void handleToggleDone(task)}
              onDurationChange={(task, min) => void handleDurationChange(task, min, d.date)}
              onTitleChange={(task, title) => void handleTitleChange(task, title)}
              onOpenDetail={handleOpenDetail}
              onCloseDetail={handleCloseDetail}
              onEpicColorChange={(task, color) => void handleEpicColorChange(task, color)}
              onCreateConference={handleCreateConference}
              onClearConference={(task) => void handleClearConference(task)}
              onPointerDragStart={onPointerDragStart}
            />
          ))}
        </div>
      </div>

      <DayTimeline
        date={selectedDate}
        tasks={tasks}
        onReschedule={(task, start) => void handleReschedule(task, start)}
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
