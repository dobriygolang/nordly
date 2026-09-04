import { useEffect, useState } from 'react';

import { loadDailyPlan } from '@features/planning/api/dailyPlan';
import { computePlanProgress, isPlanFinalizedToday } from '@features/planning/lib/planningProgress';
import { tasksForToday } from '@features/planning/lib/planningTasks';
import { listTasks } from '@features/tasks/api/tasks';
import { useTodayKey } from '@shared/hooks/useTodayKey';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';

export interface TodayPlanProgress {
  done: number;
  total: number;
  remaining: number;
}

export function useTodayPlanReview(): TodayPlanProgress | null {
  const todayKey = useTodayKey();
  const [progress, setProgress] = useState<TodayPlanProgress | null>(null);

  useEffect(() => {
    let cancelled = false;

    const reload = async (): Promise<void> => {
      try {
        const [plan, tasks] = await Promise.all([loadDailyPlan(todayKey), listTasks()]);
        if (cancelled) return;
        if (!isPlanFinalizedToday(plan, todayKey)) {
          setProgress((prev) => (prev === null ? prev : null));
          return;
        }
        const computed = computePlanProgress(plan.snapshot, tasksForToday(tasks, todayKey));
        if (!computed) {
          setProgress((prev) => (prev === null ? prev : null));
          return;
        }
        const next = {
          done: computed.doneCount,
          total: computed.plannedTotal,
          remaining: computed.activeRemaining,
        };
        setProgress((prev) =>
          prev && prev.done === next.done && prev.total === next.total && prev.remaining === next.remaining
            ? prev
            : next,
        );
      } catch (err) {
        console.error('[nordly:stats] today plan progress failed', err);
        if (!cancelled) setProgress((prev) => (prev === null ? prev : null));
      }
    };

    const onEvent = (): void => {
      if (document.hidden) return;
      void reload();
    };
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void reload();
    };

    void reload();
    window.addEventListener(NORDLY_EVENTS.tasksChanged, onEvent);
    window.addEventListener(NORDLY_EVENTS.syncChanged, onEvent);
    window.addEventListener(NORDLY_EVENTS.dailyPlanChanged, onEvent);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener(NORDLY_EVENTS.tasksChanged, onEvent);
      window.removeEventListener(NORDLY_EVENTS.syncChanged, onEvent);
      window.removeEventListener(NORDLY_EVENTS.dailyPlanChanged, onEvent);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [todayKey]);

  return progress;
}
