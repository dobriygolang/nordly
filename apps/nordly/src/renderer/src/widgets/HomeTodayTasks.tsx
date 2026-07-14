import { useCallback, useEffect, useMemo, useState } from 'react';

import { useT } from '@nordly-i18n';

import { listTasks, moveTaskStatus, type TaskCard } from '@features/tasks/api/tasks';
import { focusStoreList } from '@features/focus/repository/focusStore';
import { resolveTaskEpicColor } from '@features/tasks/lib/epicColor';
import { useTaskEpics } from '@features/tasks/lib/useTaskEpics';
import { loadDailyPlan, type DailyPlanRecord } from '@features/planning/repository/dailyPlanStore';
import { isPlanFinalizedToday, parseObstacleLines } from '@features/planning/lib/planningProgress';
import { tasksForToday } from '@features/planning/lib/planningTasks';
import { defaultDurationMin, toDayKey } from '@shared/lib/dates';
import { useFlipList } from '@shared/lib/useFlipList';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { usePomodoroStore } from '@shared/model/pomodoro';
import { useSessionStore } from '@shared/model/session';
import { OdometerTimer } from '@shared/ui/OdometerTimer';
import { Icon } from '@shared/ui/primitives/Icon';

function focusSecondsTodayForTask(
  sessions: Awaited<ReturnType<typeof focusStoreList>>,
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

export function HomeTodayTasks(): JSX.Element | null {
  const t = useT();
  const sessionReady = useSessionStore((s) => s.status === 'signed_in' && s.userId != null);
  const todayKey = useMemo(() => toDayKey(new Date()), []);
  const { epics } = useTaskEpics();
  const [tasks, setTasks] = useState<TaskCard[]>([]);
  const [focusSessions, setFocusSessions] = useState<Awaited<ReturnType<typeof focusStoreList>>>([]);
  const [dailyPlan, setDailyPlan] = useState<DailyPlanRecord>({});
  const [loadError, setLoadError] = useState<Error | null>(null);

  const activeId = usePomodoroStore((s) => s.pinnedPlanItemId);
  const running = usePomodoroStore((s) => s.running);
  const mode = usePomodoroStore((s) => s.mode);
  const remain = usePomodoroStore((s) => s.remain);
  const elapsed = usePomodoroStore((s) => s.elapsed);
  const durationSec = usePomodoroStore((s) => s.durationSec);
  const toggle = usePomodoroStore((s) => s.toggle);

  const refresh = useCallback(async () => {
    const { status, userId } = useSessionStore.getState();
    if (status !== 'signed_in' || !userId) return;

    const [taskList, sessions] = await Promise.all([listTasks(), focusStoreList()]);
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
    const onTasksChanged = () => void refresh().catch((err: unknown) => setLoadError(err instanceof Error ? err : new Error(String(err))));
    window.addEventListener(NORDLY_EVENTS.tasksChanged, onTasksChanged);
    return () => window.removeEventListener(NORDLY_EVENTS.tasksChanged, onTasksChanged);
  }, [refresh]);

  useEffect(() => {
    const onPlanChanged = () => void refreshPlan().catch((err: unknown) => setLoadError(err instanceof Error ? err : new Error(String(err))));
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

  const todayTasks = useMemo(
    () => [...tasksForToday(tasks, todayKey)].sort(sortHomeTasks),
    [tasks, todayKey],
  );

  const planFinalized = isPlanFinalizedToday(dailyPlan, todayKey);
  const obstacles = parseObstacleLines(dailyPlan.obstacles);

  const listRef = useFlipList(todayTasks.map((task) => task.id));

  const startPomodoro = (task: TaskCard) => {
    usePomodoroStore.getState().start({ planItemId: task.id, pinnedTitle: task.title });
  };

  const toggleTaskOpen = useCallback(
    async (task: TaskCard) => {
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
    },
    [],
  );

  if (!sessionReady) return null;

  if (loadError) {
    if (loadError.message.includes('userId not set')) return null;
    throw loadError;
  }

  if (todayTasks.length === 0 && !planFinalized) {
    return (
      <section className="nordly-home-today" aria-label={t('nordly.home.today_aria')}>
        <p className="nordly-home-today__empty mono">{t('nordly.home.today_empty')}</p>
      </section>
    );
  }

  return (
    <section className="nordly-home-today" aria-label={t('nordly.home.today_aria')}>
      {todayTasks.length === 0 ? (
        <p className="nordly-home-today__empty mono">{t('nordly.home.today_empty')}</p>
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
