import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useTrackerSettings } from '@features/calendar/lib/useTrackerSettings';
import { finalizeDailyPlan, loadDailyPlan, saveDailyPlanObstacles } from '@features/planning/api/dailyPlan';
import { usePlanningTaskBoard } from '@features/planning/hooks/usePlanningTaskBoard';
import { runFinalizePlan } from '@features/planning/lib/finalizePlan';
import { tasksForToday } from '@features/planning/lib/planningTasks';
import { PlanningStep } from '@features/planning/model/planningStep';
import type { TaskCard } from '@features/tasks/model/task';
import { useTaskMutationCoordinator } from '@features/tasks/hooks/useTaskMutationCoordinator';
import { useTaskEpics } from '@features/tasks/hooks/useTaskEpics';
import { isAuthError, isRecoverableTaskActionError } from '@features/tasks/lib/taskActionErrors';
import { sumTaskDurationMin } from '@features/tasks/model/duration';
import { isTaskDone } from '@features/tasks/model/status';
import { useTodayKey } from '@shared/hooks/useTodayKey';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { startOfLocalDay, parseDayKey } from '@shared/lib/dates';
import { useSyncStore } from '@shared/model/sync';

export function useDailyPlanningModal(options: {
  onClose: () => void;
  onComplete?: () => void;
}) {
  const { onClose, onComplete } = options;
  const todayKey = useTodayKey();
  const today = useMemo(() => startOfLocalDay(parseDayKey(todayKey)), [todayKey]);
  const { epics } = useTaskEpics();
  const [step, setStep] = useState<PlanningStep>(PlanningStep.Pick);
  const [tasks, setTasks] = useState<TaskCard[]>([]);
  const [obstacles, setObstacles] = useState('');
  const [finalizing, setFinalizing] = useState(false);
  const { settings: trackerSettings } = useTrackerSettings();
  const [loadError, setLoadError] = useState<Error | null>(null);
  const obstaclesRef = useRef(obstacles);
  obstaclesRef.current = obstacles;
  const loadedObstaclesRef = useRef('');
  const todayKeyRef = useRef(todayKey);
  todayKeyRef.current = todayKey;
  const finalizeInFlightRef = useRef<Promise<boolean> | null>(null);

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
    onHydrated: () => setLoadError(null),
  });

  const refresh = useCallback(
    () => coordinator.requestHydration(),
    [coordinator],
  );

  useEffect(() => {
    let cancelled = false;
    void refresh().catch(handleLoadError);
    void loadDailyPlan(todayKey)
      .then((rec) => {
        if (cancelled || todayKeyRef.current !== todayKey) return;
        const next = rec.obstacles ?? '';
        const dirty = obstaclesRef.current !== loadedObstaclesRef.current;
        loadedObstaclesRef.current = next;
        if (!dirty) setObstacles(next);
      })
      .catch((error: unknown) => {
        if (!cancelled) handleLoadError(error);
      });
    return () => {
      cancelled = true;
    };
  }, [refresh, todayKey, handleLoadError]);

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

  const board = usePlanningTaskBoard({
    todayKey,
    tasks,
    coordinator,
    poolAbsorbsNearDays: step === PlanningStep.Pick,
    onActionError: (err) => {
      if (isRecoverableTaskActionError(err)) return;
      handleLoadError(err);
    },
  });

  const todayTasks = useMemo(() => tasksForToday(tasks, todayKey), [tasks, todayKey]);
  const activeTodayTasks = useMemo(
    () => todayTasks.filter((task) => !isTaskDone(task.status)),
    [todayTasks],
  );

  const persistObstacles = useCallback(
    (value: string) => {
      obstaclesRef.current = value;
      setObstacles(value);
      void saveDailyPlanObstacles(value, todayKey).then(
        () => setLoadError(null),
        handleLoadError,
      );
    },
    [todayKey, handleLoadError],
  );

  const flushObstacles = useCallback(
    async (latest = obstaclesRef.current): Promise<boolean> => {
      obstaclesRef.current = latest;
      setObstacles(latest);
      try {
        await saveDailyPlanObstacles(latest, todayKeyRef.current);
        setLoadError(null);
        return true;
      } catch (err) {
        handleLoadError(err);
        return false;
      }
    },
    [handleLoadError],
  );

  const handleObstaclesBlur = useCallback(() => {
    persistObstacles(obstaclesRef.current);
  }, [persistObstacles]);

  const doneTodayCount = todayTasks.length - activeTodayTasks.length;

  const handleFinalize = useCallback(
    (latest = obstaclesRef.current): Promise<boolean> => {
      const inFlight = finalizeInFlightRef.current;
      if (inFlight) return inFlight;
      obstaclesRef.current = latest;
      setObstacles(latest);
      setFinalizing(true);
      const pending = runFinalizePlan({
        finalize: () =>
          finalizeDailyPlan(
            latest,
            {
              taskIds: todayTasks.map((task) => task.id),
              activeCount: activeTodayTasks.length,
              totalDurationMin: sumTaskDurationMin(activeTodayTasks),
            },
            todayKey,
          ),
        onSuccess: () => {
          setLoadError(null);
          window.dispatchEvent(new CustomEvent(NORDLY_EVENTS.dailyPlanChanged));
          onComplete?.();
          onClose();
        },
        onError: handleLoadError,
      });
      finalizeInFlightRef.current = pending;
      void pending.then(
        () => {
          if (finalizeInFlightRef.current === pending) {
            finalizeInFlightRef.current = null;
            setFinalizing(false);
          }
        },
        () => {
          if (finalizeInFlightRef.current === pending) {
            finalizeInFlightRef.current = null;
            setFinalizing(false);
          }
        },
      );
      return pending;
    },
    [todayKey, todayTasks, activeTodayTasks, onComplete, onClose, handleLoadError],
  );

  return {
    today,
    todayKey,
    step,
    setStep,
    epics,
    trackerSettings,
    loadError,
    board,
    todayTasks,
    activeTodayTasks,
    obstacles,
    finalizing,
    setObstacles,
    obstaclesRef,
    persistObstacles,
    handleObstaclesBlur,
    flushObstacles,
    handleFinalize,
    handleLoadError,
    refresh,
    doneTodayCount,
  };
}
