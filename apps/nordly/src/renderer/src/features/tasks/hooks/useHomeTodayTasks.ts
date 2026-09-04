import { useCallback, useEffect, useMemo, useState } from 'react';

import { inspectCalendarEntry } from '@features/calendar/lib/calendarInspect';
import {
  appleToCalendarEntries,
  googleToCalendarEntries,
  linkedGoogleEventIds,
  taskIsMeeting,
  tasksPlannedForDay,
  upcomingHomeMeetings,
  type CalendarEntry,
} from '@features/calendar/lib/events';
import { useAppleCalendarEvents } from '@features/calendar/lib/useAppleCalendarEvents';
import { useGoogleCalendarConnection } from '@features/calendar/lib/useGoogleCalendarConnection';
import { useGoogleCalendarEvents } from '@features/calendar/lib/useGoogleCalendarEvents';
import { CalendarEntrySource } from '@features/calendar/model/entry';
import { listFocusSessions, sameFocusSessions } from '@features/focus/api/focusClient';
import { loadDailyPlan, sameDailyPlan, type DailyPlanRecord } from '@features/planning/api/dailyPlan';
import { isPlanFinalizedToday, parseObstacleLines } from '@features/planning/lib/planningProgress';
import { tasksForToday } from '@features/planning/lib/planningTasks';
import { displayTaskTitle, moveTaskStatus } from '@features/tasks/api/tasks';
import { useTaskEpics } from '@features/tasks/hooks/useTaskEpics';
import { useTaskMutationCoordinator } from '@features/tasks/hooks/useTaskMutationCoordinator';
import { isTaskDone, nextTaskCompletionStatus } from '@features/tasks/model/status';
import type { TaskCard } from '@features/tasks/model/task';
import { useNowTick } from '@shared/hooks/useNowTick';
import { useTodayKey } from '@shared/hooks/useTodayKey';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { parseDayKey, startOfLocalDay, toDayKey } from '@shared/lib/dates';
import { isCloudEnabled } from '@shared/model/features';
import { usePomodoroStore } from '@shared/model/pomodoro';
import { AuthStatus, useSessionStore } from '@shared/model/session';
import { useAppleCalendarEnabled } from '@shared/model/useAppleCalendarEnabled';

const MEETING_TICK_MS = 30_000;

export function focusSecondsTodayForTask(
  sessions: Awaited<ReturnType<typeof listFocusSessions>>,
  planItemId: string,
  dayKey: string,
): number {
  let total = 0;
  for (const s of sessions) {
    if (s.planItemId !== planItemId || !s.endedAt || s.secondsFocused <= 0) continue;
    if (toDayKey(new Date(s.endedAt)) === dayKey) total += s.secondsFocused;
  }
  return total;
}

export function useHomeTodayTasks() {
  const sessionReady = useSessionStore(
    (s) => s.status === AuthStatus.SignedIn && s.userId != null,
  );
  const todayKey = useTodayKey();
  const todayDate = useMemo(() => parseDayKey(todayKey), [todayKey]);
  const { epics } = useTaskEpics();
  const [tasks, setTasks] = useState<TaskCard[]>([]);
  const [focusSessions, setFocusSessions] = useState<Awaited<ReturnType<typeof listFocusSessions>>>([]);
  const [dailyPlan, setDailyPlan] = useState<DailyPlanRecord>({});
  const [loadError, setLoadError] = useState<Error | null>(null);
  const nowMs = useNowTick(MEETING_TICK_MS).getTime();
  const handleLoadError = useCallback((error: unknown) => {
    setLoadError(error instanceof Error ? error : new Error(String(error)));
  }, []);
  const coordinator = useTaskMutationCoordinator({
    tasks,
    setTasks,
    onHydrationError: handleLoadError,
    onHydrated: () => setLoadError(null),
  });

  const dayStart = useMemo(() => startOfLocalDay(todayDate), [todayDate]);
  const dayEnd = useMemo(() => {
    const end = startOfLocalDay(todayDate);
    end.setDate(end.getDate() + 1);
    return end;
  }, [todayDate]);

  const { cachedEventsAvailable } = useGoogleCalendarConnection();
  const googleEnabled = isCloudEnabled() && cachedEventsAvailable;
  const appleCalendarEnabled = useAppleCalendarEnabled();
  const { events: googleEvents } = useGoogleCalendarEvents(dayStart, dayEnd, googleEnabled);
  const { events: appleEvents } = useAppleCalendarEvents(dayStart, dayEnd, appleCalendarEnabled);

  const refresh = useCallback(async () => {
    const { status, userId } = useSessionStore.getState();
    if (status !== AuthStatus.SignedIn || !userId) return;

    const [, sessions] = await Promise.all([
      coordinator.requestHydration(),
      listFocusSessions(),
    ]);
    setFocusSessions(sessions);
  }, [coordinator]);

  const refreshPlan = useCallback(async () => {
    const { status, userId } = useSessionStore.getState();
    if (status !== AuthStatus.SignedIn || !userId) return;

    const next = await loadDailyPlan(todayKey);
    setDailyPlan((prev) => (sameDailyPlan(prev, next) ? prev : next));
    setLoadError(null);
  }, [todayKey]);

  useEffect(() => {
    if (!sessionReady) return;
    void refresh().catch((err: unknown) => setLoadError(err instanceof Error ? err : new Error(String(err))));
    void refreshPlan().catch((err: unknown) => setLoadError(err instanceof Error ? err : new Error(String(err))));
  }, [sessionReady, refresh, refreshPlan]);

  useEffect(() => {
    const onTasksChanged = () =>
      void Promise.all([coordinator.requestHydration(), listFocusSessions()])
        .then(([, sessions]) => {
          setFocusSessions((prev) => (sameFocusSessions(prev, sessions) ? prev : sessions));
        })
        .catch(handleLoadError);
    window.addEventListener(NORDLY_EVENTS.tasksChanged, onTasksChanged);
    window.addEventListener(NORDLY_EVENTS.syncChanged, onTasksChanged);
    return () => {
      window.removeEventListener(NORDLY_EVENTS.tasksChanged, onTasksChanged);
      window.removeEventListener(NORDLY_EVENTS.syncChanged, onTasksChanged);
    };
  }, [coordinator, handleLoadError]);

  useEffect(() => {
    const onPlanChanged = () =>
      void refreshPlan().catch((err: unknown) => setLoadError(err instanceof Error ? err : new Error(String(err))));
    window.addEventListener(NORDLY_EVENTS.dailyPlanChanged, onPlanChanged);
    return () => window.removeEventListener(NORDLY_EVENTS.dailyPlanChanged, onPlanChanged);
  }, [refreshPlan]);

  useEffect(() => {
    return usePomodoroStore.subscribe((state, prev) => {
      if (!prev.running || state.running) return;
      void listFocusSessions()
        .then((sessions) => {
          setFocusSessions((prev) => (sameFocusSessions(prev, sessions) ? prev : sessions));
          setLoadError(null);
        })
        .catch((err: unknown) => setLoadError(err instanceof Error ? err : new Error(String(err))));
    });
  }, []);

  const todayAll = useMemo(
    () => tasksForToday(tasks, todayKey),
    [tasks, todayKey],
  );
  const todayTasks = useMemo(
    () => todayAll.filter((task) => !taskIsMeeting(task)),
    [todayAll],
  );

  const linkedGoogleIds = useMemo(() => linkedGoogleEventIds(tasks), [tasks]);
  const upcomingMeetings = useMemo(() => {
    const meetingTasks = todayAll.filter(taskIsMeeting);
    const taskMeetingEntries: CalendarEntry[] = tasksPlannedForDay(todayKey, meetingTasks).map(
      ({ task, start, end }) => ({
        id: `task:${task.id}`,
        source: CalendarEntrySource.Task,
        title: displayTaskTitle(task.title, task.id),
        start,
        end,
        allDay: false,
        taskId: task.id,
        taskStatus: task.status,
        epicId: task.epicId,
        epicColor: task.epicColor,
        conferenceUrl: task.conferenceUrl,
        conferenceProvider: task.conferenceProvider,
      }),
    );
    return upcomingHomeMeetings(
      [
        ...googleToCalendarEntries(googleEvents, linkedGoogleIds, tasks),
        ...appleToCalendarEntries(appleEvents),
        ...taskMeetingEntries,
      ],
      new Date(nowMs),
    );
  }, [googleEvents, appleEvents, linkedGoogleIds, tasks, todayAll, todayKey, nowMs]);

  const planFinalized = isPlanFinalizedToday(dailyPlan, todayKey);
  const obstacles = parseObstacleLines(dailyPlan.obstacles);

  const startPomodoro = (task: TaskCard) => {
    usePomodoroStore.getState().start({ planItemId: task.id, pinnedTitle: task.title });
  };

  const startMeetingFocus = (entry: CalendarEntry) => {
    if (entry.taskId) {
      usePomodoroStore.getState().start({
        planItemId: entry.taskId,
        pinnedTitle: entry.title,
      });
      return;
    }
    usePomodoroStore.getState().start({ pinnedTitle: entry.title });
  };

  const openMeeting = (entry: CalendarEntry) => {
    inspectCalendarEntry(entry);
  };

  const toggleTaskOpen = useCallback(
    async (task: TaskCard) => {
      const current =
        coordinator.getTasks().find((candidate) => candidate.id === task.id) ?? task;
      const next =
        nextTaskCompletionStatus(current.status);
      const now = new Date().toISOString();
      await coordinator.mutate({
        optimistic: (taskList) =>
          taskList.map((candidate) =>
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
        commit: (taskList, updated) =>
          taskList.map((candidate) =>
            candidate.id === task.id ? updated : candidate,
          ),
        onError: handleLoadError,
      });
    },
    [coordinator, handleLoadError],
  );

  return {
    sessionReady,
    todayKey,
    epics,
    todayTasks,
    upcomingMeetings,
    planFinalized,
    obstacles,
    loadError,
    focusSessions,
    startPomodoro,
    startMeetingFocus,
    openMeeting,
    toggleTaskOpen,
  };
}
