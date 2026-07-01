import { useCallback, useEffect, useMemo, useState } from 'react';

import { useT } from '@nordly-i18n';

import { listTasks, moveTaskStatus, type TaskCard } from '@features/tasks/api/tasks';
import { focusStoreList } from '@features/focus/repository/focusStore';
import { resolveTaskEpicColor } from '@features/tasks/lib/epicColor';
import { useTaskEpics } from '@features/tasks/lib/useTaskEpics';
import { tasksForToday } from '@pages/DailyPlanning/lib/planningTasks';
import { toDayKey } from '@pages/TaskBoard/lib/dates';
import { useFlipList } from '@pages/TaskBoard/useFlipList';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { usePomodoroStore } from '@shared/model/pomodoro';
import { Icon } from '@shared/ui/primitives/Icon';

function formatFocusMmSs(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

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
  const aDone = a.status === 'done' ? 1 : 0;
  const bDone = b.status === 'done' ? 1 : 0;
  if (aDone !== bDone) return bDone - aDone;
  const aOrder = a.order ?? new Date(a.createdAt).getTime();
  const bOrder = b.order ?? new Date(b.createdAt).getTime();
  return aOrder - bOrder;
}

export function HomeTodayTasks(): JSX.Element {
  const t = useT();
  const todayKey = useMemo(() => toDayKey(new Date()), []);
  const { epics } = useTaskEpics();
  const [tasks, setTasks] = useState<TaskCard[]>([]);
  const [focusSessions, setFocusSessions] = useState<Awaited<ReturnType<typeof focusStoreList>>>([]);

  const activeId = usePomodoroStore((s) => s.pinnedPlanItemId);
  const running = usePomodoroStore((s) => s.running);
  const mode = usePomodoroStore((s) => s.mode);
  const remain = usePomodoroStore((s) => s.remain);
  const elapsed = usePomodoroStore((s) => s.elapsed);
  const displaySec = mode === 'pomodoro' ? remain : elapsed;
  const toggle = usePomodoroStore((s) => s.toggle);

  const refresh = useCallback(async () => {
    try {
      const [taskList, sessions] = await Promise.all([listTasks(), focusStoreList()]);
      setTasks(taskList);
      setFocusSessions(sessions);
    } catch {
      /* keep stale */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onTasksChanged = () => void refresh();
    window.addEventListener(NORDLY_EVENTS.tasksChanged, onTasksChanged);
    return () => window.removeEventListener(NORDLY_EVENTS.tasksChanged, onTasksChanged);
  }, [refresh]);

  const todayTasks = useMemo(
    () => [...tasksForToday(tasks, todayKey)].sort(sortHomeTasks),
    [tasks, todayKey],
  );

  const listRef = useFlipList(
    todayTasks.map((task) => task.id),
    todayTasks.map((task) => `${task.id}:${task.status}`).join('|'),
  );

  const startPomodoro = (task: TaskCard) => {
    usePomodoroStore.getState().start({ planItemId: task.id, pinnedTitle: task.title });
  };

  const toggleTaskOpen = useCallback(
    async (task: TaskCard) => {
      const next = task.status === 'done' ? 'todo' : 'done';
      setTasks((prev) => prev.map((item) => (item.id === task.id ? { ...item, status: next } : item)));
      try {
        await moveTaskStatus(task.id, next);
        window.dispatchEvent(new CustomEvent(NORDLY_EVENTS.tasksChanged));
      } catch {
        void refresh();
      }
    },
    [refresh],
  );

  if (todayTasks.length === 0) {
    return (
      <section className="nordly-home-today" aria-label={t('nordly.home.today_aria')}>
        <p className="nordly-home-today__empty mono">{t('nordly.home.today_empty')}</p>
      </section>
    );
  }

  return (
    <section className="nordly-home-today" aria-label={t('nordly.home.today_aria')}>
      <div className="nordly-home-today__list" ref={listRef} role="list">
        {todayTasks.map((task) => {
          const done = task.status === 'done';
          const epicColor = resolveTaskEpicColor(task, epics);
          const isActive = activeId === task.id;
          const timerSec = isActive
            ? displaySec
            : focusSecondsTodayForTask(focusSessions, task.id, todayKey);

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
                  <span className="nordly-home-today__timer mono">{formatFocusMmSs(timerSec)}</span>
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
    </section>
  );
}
