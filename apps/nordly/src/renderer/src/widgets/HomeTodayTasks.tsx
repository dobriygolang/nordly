import { useCallback, useEffect, useMemo, useState } from 'react';

import { useT, useLocale, type Locale } from '@nordly-i18n';

import { listTasks, moveTaskStatus, type TaskCard } from '@features/tasks/api/tasks';
import { listFocusSessions } from '@features/focus/api/focusClient';
import { resolveTaskEpicColor } from '@features/tasks/lib/epicColor';
import { useTaskEpics } from '@features/tasks/lib/useTaskEpics';
import { loadDailyPlan, type DailyPlanRecord } from '@features/planning/api/dailyPlan';
import { isPlanFinalizedToday, parseObstacleLines } from '@features/planning/lib/planningProgress';
import { tasksForToday } from '@features/planning/lib/planningTasks';
import {
  appleToCalendarEntries,
  googleToCalendarEntries,
  linkedGoogleEventIds,
  taskIsMeeting,
  tasksPlannedForDay,
  upcomingHomeMeetings,
  type CalendarEntry,
} from '@features/calendar/lib/events';
import { inspectCalendarEntry } from '@features/calendar/lib/calendarInspect';
import { useGoogleCalendarConnection } from '@features/calendar/lib/useGoogleCalendarConnection';
import { useGoogleCalendarEvents } from '@features/calendar/lib/useGoogleCalendarEvents';
import { useAppleCalendarEvents } from '@features/calendar/lib/useAppleCalendarEvents';
import { isCloudEnabled } from '@shared/model/features';
import { readSettings } from '@shared/model/settings';
import { defaultDurationMin, parseDayKey, startOfLocalDay, toDayKey } from '@shared/lib/dates';
import { formatLocaleTime } from '@shared/lib/localeFormat';
import { useFlipList } from '@shared/lib/useFlipList';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { usePomodoroStore } from '@shared/model/pomodoro';
import { useSessionStore } from '@shared/model/session';
import { useTodayKey } from '@shared/hooks/useTodayKey';
import { OdometerTimer } from '@shared/ui/OdometerTimer';
import { Icon } from '@shared/ui/primitives/Icon';

const MEETING_TICK_MS = 30_000;

function focusSecondsTodayForTask(
  sessions: Awaited<ReturnType<typeof listFocusSessions>>,
  planItemId: string,
  dayKey: string,
): number {
  let total = 0;
  for (const s of sessions) {
    if (s.planItemId !== planItemId || !s.endedAt || s.secondsFocused <= 0) continue;
    if (s.endedAt.slice(0, 10) === dayKey) total += s.secondsFocused;
  }
  return total;
}

function sortHomeTasks(a: TaskCard, b: TaskCard): number {
  const aOrder = a.order ?? new Date(a.createdAt).getTime();
  const bOrder = b.order ?? new Date(b.createdAt).getTime();
  return aOrder - bOrder;
}

function formatMeetingWhen(entry: CalendarEntry, todayKey: string, locale: Locale): string {
  const time = formatLocaleTime(entry.start, locale);
  if (toDayKey(entry.start) === todayKey) return time;
  const day = entry.start.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  return `${day} · ${time}`;
}

export function HomeTodayTasks(): JSX.Element | null {
  const t = useT();
  const [locale] = useLocale();
  const sessionReady = useSessionStore((s) => s.status === 'signed_in' && s.userId != null);
  const todayKey = useTodayKey();
  const todayDate = useMemo(() => parseDayKey(todayKey), [todayKey]);
  const { epics } = useTaskEpics();
  const [tasks, setTasks] = useState<TaskCard[]>([]);
  const [focusSessions, setFocusSessions] = useState<Awaited<ReturnType<typeof listFocusSessions>>>([]);
  const [dailyPlan, setDailyPlan] = useState<DailyPlanRecord>({});
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const activeId = usePomodoroStore((s) => s.pinnedPlanItemId);
  const pinnedTitle = usePomodoroStore((s) => s.pinnedTitle);
  const running = usePomodoroStore((s) => s.running);
  const mode = usePomodoroStore((s) => s.mode);
  const remain = usePomodoroStore((s) => s.remain);
  const elapsed = usePomodoroStore((s) => s.elapsed);
  const durationSec = usePomodoroStore((s) => s.durationSec);
  const toggle = usePomodoroStore((s) => s.toggle);

  const dayStart = useMemo(() => startOfLocalDay(todayDate), [todayDate]);
  const dayEnd = useMemo(() => {
    const end = startOfLocalDay(todayDate);
    end.setDate(end.getDate() + 1);
    return end;
  }, [todayDate]);

  const { connected, ready: connectionReady } = useGoogleCalendarConnection();
  const googleEnabled = isCloudEnabled() && connected && connectionReady;
  const appleCalendarEnabled = readSettings().appleCalendarEnabled;
  const { events: googleEvents } = useGoogleCalendarEvents(dayStart, dayEnd, googleEnabled);
  const { events: appleEvents } = useAppleCalendarEvents(dayStart, dayEnd, appleCalendarEnabled);

  const refresh = useCallback(async () => {
    const { status, userId } = useSessionStore.getState();
    if (status !== 'signed_in' || !userId) return;

    const [taskList, sessions] = await Promise.all([listTasks(), listFocusSessions()]);
    setTasks(taskList);
    setFocusSessions(sessions);
    setLoadError(null);
  }, []);

  const refreshPlan = useCallback(async () => {
    const { status, userId } = useSessionStore.getState();
    if (status !== 'signed_in' || !userId) return;

    setDailyPlan(await loadDailyPlan(todayKey));
    setLoadError(null);
  }, [todayKey]);

  useEffect(() => {
    if (!sessionReady) return;
    void refresh().catch((err: unknown) => setLoadError(err instanceof Error ? err : new Error(String(err))));
    void refreshPlan().catch((err: unknown) => setLoadError(err instanceof Error ? err : new Error(String(err))));
  }, [sessionReady, refresh, refreshPlan]);

  useEffect(() => {
    const onTasksChanged = () =>
      void refresh().catch((err: unknown) => setLoadError(err instanceof Error ? err : new Error(String(err))));
    window.addEventListener(NORDLY_EVENTS.tasksChanged, onTasksChanged);
    return () => window.removeEventListener(NORDLY_EVENTS.tasksChanged, onTasksChanged);
  }, [refresh]);

  useEffect(() => {
    const onPlanChanged = () =>
      void refreshPlan().catch((err: unknown) => setLoadError(err instanceof Error ? err : new Error(String(err))));
    window.addEventListener(NORDLY_EVENTS.dailyPlanChanged, onPlanChanged);
    return () => window.removeEventListener(NORDLY_EVENTS.dailyPlanChanged, onPlanChanged);
  }, [refreshPlan]);

  useEffect(() => {
    return usePomodoroStore.subscribe((state, prev) => {
      if (prev.running && !state.running) {
        void refresh().catch((err: unknown) =>
          setLoadError(err instanceof Error ? err : new Error(String(err))),
        );
      }
    });
  }, [refresh]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), MEETING_TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const todayAll = useMemo(
    () => [...tasksForToday(tasks, todayKey)].sort(sortHomeTasks),
    [tasks, todayKey],
  );
  const todayTasks = useMemo(
    () => todayAll.filter((task) => !taskIsMeeting(task)),
    [todayAll],
  );

  const linkedGoogleIds = useMemo(() => linkedGoogleEventIds(tasks), [tasks]);
  const upcomingMeetings = useMemo(() => {
    const meetingTasks = todayAll.filter(taskIsMeeting);
    const taskMeetingEntries: CalendarEntry[] = tasksPlannedForDay(
      todayKey,
      meetingTasks,
    ).map(({ task, start, end }) => ({
      id: `task:${task.id}`,
      source: 'task',
      title: task.title || 'Untitled',
      start,
      end,
      allDay: false,
      taskId: task.id,
      taskStatus: task.status,
      epicId: task.epicId,
      epicColor: task.epicColor,
      conferenceUrl: task.conferenceUrl,
      conferenceProvider: task.conferenceProvider,
    }));
    return upcomingHomeMeetings(
      [
        ...googleToCalendarEntries(googleEvents, linkedGoogleIds),
        ...appleToCalendarEntries(appleEvents),
        ...taskMeetingEntries,
      ],
      new Date(nowMs),
    );
  }, [googleEvents, appleEvents, linkedGoogleIds, todayAll, todayKey, nowMs]);

  const planFinalized = isPlanFinalizedToday(dailyPlan, todayKey);
  const obstacles = parseObstacleLines(dailyPlan.obstacles);

  const listRef = useFlipList(todayTasks.map((task) => task.id));
  const meetingsRef = useFlipList(upcomingMeetings.map((m) => m.id));

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

  const toggleTaskOpen = useCallback(async (task: TaskCard) => {
    const next = task.status === 'done' ? 'todo' : 'done';
    setTasks((prev) => prev.map((item) => (item.id === task.id ? { ...item, status: next } : item)));
    try {
      const updated = await moveTaskStatus(task.id, next);
      setTasks((prev) => prev.map((item) => (item.id === task.id ? updated : item)));
      window.dispatchEvent(new CustomEvent(NORDLY_EVENTS.tasksChanged));
    } catch (err) {
      setTasks((prev) =>
        prev.map((item) => (item.id === task.id ? { ...item, status: task.status } : item)),
      );
      setLoadError(err instanceof Error ? err : new Error(String(err)));
    }
  }, []);

  if (!sessionReady) return null;

  if (loadError) {
    if (loadError.message.includes('userId not set')) return null;
    throw loadError;
  }

  if (todayTasks.length === 0 && upcomingMeetings.length === 0 && !planFinalized) {
    return (
      <section className="nordly-home-today" aria-label={t('nordly.home.today_aria')}>
        <p className="nordly-home-today__empty mono">{t('nordly.home.today_empty')}</p>
      </section>
    );
  }

  return (
    <section className="nordly-home-today" aria-label={t('nordly.home.today_aria')}>
      {todayTasks.length === 0 ? (
        upcomingMeetings.length === 0 ? (
          <p className="nordly-home-today__empty mono">{t('nordly.home.today_empty')}</p>
        ) : null
      ) : (
        <div className="nordly-home-today__list" ref={listRef} role="list">
          {todayTasks.map((task) => {
            const done = task.status === 'done';
            const epicColor = resolveTaskEpicColor(task, epics);
            const isActive = activeId === task.id;
            const focusedTodaySec = focusSecondsTodayForTask(focusSessions, task.id, todayKey);
            const activeSessionSec =
              isActive ? (mode === 'pomodoro' ? Math.max(0, durationSec - remain) : elapsed) : 0;
            const timerSec = Math.max(
              0,
              defaultDurationMin(task) * 60 - focusedTodaySec - activeSessionSec,
            );

            return (
              <div
                key={task.id}
                data-flip-key={task.id}
                className="nordly-home-today__item"
                role="listitem"
                data-done={done ? 'true' : undefined}
                data-active={isActive ? 'true' : undefined}
                data-open={done ? undefined : 'true'}
              >
                <button
                  type="button"
                  className="nordly-home-today__main focus-ring"
                  onClick={() => void toggleTaskOpen(task)}
                >
                  {epicColor ? (
                    <span
                      className="nordly-home-today__stripe"
                      style={{ background: epicColor }}
                      aria-hidden
                    />
                  ) : null}
                  <span className="nordly-home-today__title">{task.title}</span>
                </button>
                {!done ? (
                  <span className="nordly-home-today__meta">
                    <OdometerTimer
                      totalSec={timerSec}
                      running={isActive && running}
                      className="nordly-home-today__timer"
                    />
                    <button
                      type="button"
                      className="nordly-home-today__play focus-ring"
                      title={t('nordly.home.today_start_focus')}
                      aria-label={t('nordly.home.today_start_focus')}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isActive) toggle();
                        else startPomodoro(task);
                      }}
                    >
                      <Icon
                        name={isActive && running ? 'pause' : 'play-outline'}
                        size={12}
                        strokeWidth={2}
                      />
                    </button>
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {upcomingMeetings.length > 0 ? (
        <section className="nordly-home-today__meetings" aria-label={t('nordly.home.meetings_aria')}>
          <h3 className="nordly-home-today__meetings-heading">{t('nordly.home.meetings_heading')}</h3>
          <div className="nordly-home-today__list" ref={meetingsRef} role="list">
            {upcomingMeetings.map((meeting) => {
              const isActive = meeting.taskId
                ? activeId === meeting.taskId
                : !activeId && pinnedTitle === meeting.title;
              const canOpen =
                meeting.source === 'google' ||
                meeting.source === 'apple' ||
                Boolean(meeting.conferenceUrl);
              return (
                <div
                  key={meeting.id}
                  data-flip-key={meeting.id}
                  className="nordly-home-today__item nordly-home-today__item--meeting"
                  role="listitem"
                  data-active={isActive ? 'true' : undefined}
                  data-source={meeting.source}
                >
                  {canOpen ? (
                    <button
                      type="button"
                      className="nordly-home-today__main focus-ring"
                      title={meeting.title}
                      onClick={() => openMeeting(meeting)}
                    >
                      <span
                        className="nordly-home-today__stripe"
                        data-source={meeting.source}
                        aria-hidden
                      />
                      <span className="nordly-home-today__title">{meeting.title}</span>
                    </button>
                  ) : (
                    <div className="nordly-home-today__main nordly-home-today__main--static">
                      <span
                        className="nordly-home-today__stripe"
                        data-source={meeting.source}
                        aria-hidden
                      />
                      <span className="nordly-home-today__title" title={meeting.title}>
                        {meeting.title}
                      </span>
                    </div>
                  )}
                  <span className="nordly-home-today__meta">
                    <span className="nordly-home-today__when mono">
                      {formatMeetingWhen(meeting, todayKey, locale)}
                    </span>
                    <button
                      type="button"
                      className="nordly-home-today__play focus-ring"
                      title={t('nordly.home.meeting_start_focus')}
                      aria-label={t('nordly.home.meeting_start_focus')}
                      onClick={() => {
                        if (isActive) toggle();
                        else startMeetingFocus(meeting);
                      }}
                    >
                      <Icon
                        name={isActive && running ? 'pause' : 'play-outline'}
                        size={12}
                        strokeWidth={2}
                      />
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {planFinalized && obstacles.length > 0 ? (
        <section className="nordly-home-today__obstacles" aria-label={t('nordly.planning.obstacles_heading')}>
          <h3 className="nordly-home-today__obstacles-heading">{t('nordly.planning.obstacles_heading')}</h3>
          <ul className="nordly-home-today__obstacles-list">
            {obstacles.map((item, index) => (
              <li key={`home-obstacle-${index}`} className="nordly-home-today__obstacles-item">
                {item}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}
