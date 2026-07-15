import { useCallback, useEffect, useMemo, useState } from 'react';

import { useT } from '@nordly-i18n';

import { listTasks, scheduleTask, type TaskCard } from '@features/tasks/api/tasks';
import { getTrackerSettings, type TrackerSettings } from '@features/calendar/api/calendarClient';
import { isCloudEnabled } from '@shared/model/features';
import { useTaskEpics } from '@features/tasks/lib/useTaskEpics';
import { isRecoverableTaskActionError } from '@features/tasks/lib/taskActionErrors';
import { DayTimeline } from '@features/tasks/components/DayTimeline';
import {
  buildDefaultScheduleDate,
  defaultDurationMin,
  parseDayKey,
  startOfLocalDay,
  sumDurationMin,
  taskScheduleStart,
} from '@shared/lib/dates';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { Icon } from '@shared/ui/primitives/Icon';
import { zIndex } from '@shared/lib/z-index';
import { useTodayKey } from '@shared/hooks/useTodayKey';

import { finalizeDailyPlan, loadDailyPlan, saveDailyPlanObstacles } from '@features/planning/api/dailyPlan';
import { tasksForToday, totalDurationLabel } from '@features/planning/lib/planningTasks';
import { usePlanningTaskBoard } from '@features/planning/hooks/usePlanningTaskBoard';
import { useSyncStore } from '@shared/model/sync';
import { PickStep } from './steps/PickStep';
import { DeferStep } from './steps/DeferStep';
import { FinalizeStep } from './steps/FinalizeStep';

export type PlanningStep = 'pick' | 'defer' | 'finalize';

function isAuthError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /\b401\b|unauthorized/i.test(message);
}

interface DailyPlanningModalProps {
  onClose: () => void;
  onComplete?: () => void;
  closing?: boolean;
}

export function DailyPlanningModal({
  onClose,
  onComplete,
  closing = false,
}: DailyPlanningModalProps): JSX.Element {
  const t = useT();
  const todayKey = useTodayKey();
  const today = useMemo(() => startOfLocalDay(parseDayKey(todayKey)), [todayKey]);
  const { epics } = useTaskEpics();
  const [step, setStep] = useState<PlanningStep>('pick');
  const [tasks, setTasks] = useState<TaskCard[]>([]);
  const [obstacles, setObstacles] = useState('');
  const [trackerSettings, setTrackerSettings] = useState<TrackerSettings | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);

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
    setLoadError(null);
  }, []);

  useEffect(() => {
    void refresh().catch(handleLoadError);
    void loadDailyPlan(todayKey)
      .then((rec) => setObstacles(rec.obstacles ?? ''))
      .catch(handleLoadError);
  }, [refresh, todayKey, handleLoadError]);

  useEffect(() => {
    if (!isCloudEnabled()) return;
    void getTrackerSettings()
      .then(setTrackerSettings)
      .catch(handleLoadError);
  }, [handleLoadError]);

  useEffect(() => {
    const onTasksChanged = () => void refresh().catch(handleLoadError);
    window.addEventListener(NORDLY_EVENTS.tasksChanged, onTasksChanged);
    return () => window.removeEventListener(NORDLY_EVENTS.tasksChanged, onTasksChanged);
  }, [refresh, handleLoadError]);

  const board = usePlanningTaskBoard({
    todayKey,
    tasks,
    setTasks,
    refresh,
    onActionError: (err) => {
      if (isRecoverableTaskActionError(err)) return;
      handleLoadError(err);
    },
  });

  const todayTasks = useMemo(() => tasksForToday(tasks, todayKey), [tasks, todayKey]);
  const activeTodayTasks = useMemo(
    () => todayTasks.filter((task) => task.status !== 'done'),
    [todayTasks],
  );

  const handleObstaclesBlur = useCallback(() => {
    void saveDailyPlanObstacles(obstacles, todayKey);
  }, [obstacles, todayKey]);

  const doneTodayCount = todayTasks.length - activeTodayTasks.length;

  const handleFinalize = useCallback(async () => {
    await finalizeDailyPlan(
      obstacles,
      {
        taskIds: todayTasks.map((task) => task.id),
        activeCount: activeTodayTasks.length,
        totalDurationMin: sumDurationMin(activeTodayTasks),
      },
      todayKey,
    );
    window.dispatchEvent(new CustomEvent(NORDLY_EVENTS.dailyPlanChanged));
    onComplete?.();
    onClose();
  }, [obstacles, todayKey, todayTasks, activeTodayTasks, onComplete, onClose]);

  const stepMeta = useMemo(() => {
    if (step === 'pick') {
      return {
        title: t('nordly.planning.pick_title'),
        subtitle: t('nordly.planning.pick_subtitle'),
        action: t('nordly.planning.continue'),
        onAction: () => setStep('defer'),
        showBack: false,
      };
    }
    if (step === 'defer') {
      return {
        title: t('nordly.planning.defer_title'),
        subtitle: t('nordly.planning.defer_subtitle'),
        action: t('nordly.planning.continue'),
        onAction: () => setStep('finalize'),
        showBack: true,
      };
    }
    return {
      title: t('nordly.planning.finalize_title'),
      subtitle: t('nordly.planning.finalize_subtitle'),
      action: t('nordly.planning.get_started'),
      onAction: () => void handleFinalize(),
      showBack: true,
    };
  }, [step, t, handleFinalize]);

  if (loadError) throw loadError;

  return (
    <div
      className="nordly-planning-backdrop fadein"
      data-closing={closing ? 'true' : undefined}
      style={{ zIndex: zIndex.modal }}
      onClick={onClose}
    >
      <div
        className={`nordly-planning-modal motion-modal-in ${closing ? 'slide-to-right' : ''}`}
        data-step={step}
        role="dialog"
        aria-modal="true"
        aria-label={t('nordly.planning.title')}
        onClick={(e) => e.stopPropagation()}
      >
        <aside className="nordly-planning-rail">
          <div className="nordly-planning-rail__copy">
            <h2 className="nordly-planning-rail__title">{stepMeta.title}</h2>
            <p className="nordly-planning-rail__subtitle">{stepMeta.subtitle}</p>
          </div>
          <div className="nordly-planning-rail__actions">
            <button
              type="button"
              className="nordly-planning-rail__back focus-ring"
              aria-label={t('nordly.planning.back')}
              disabled={!stepMeta.showBack}
              onClick={() => setStep(step === 'finalize' ? 'defer' : 'pick')}
            >
              <Icon name="chevron-left" size={16} />
            </button>
            <button
              type="button"
              className="nordly-planning-rail__continue focus-ring"
              onClick={stepMeta.onAction}
            >
              {stepMeta.action}
            </button>
          </div>
        </aside>

        <div className="nordly-planning-main">
          {step === 'pick' ? (
            <PickStep todayKey={todayKey} epics={epics} settings={trackerSettings} board={board} />
          ) : null}
          {step === 'defer' ? (
            <DeferStep todayKey={todayKey} epics={epics} settings={trackerSettings} board={board} />
          ) : null}
          {step === 'finalize' ? (
            <FinalizeStep
              todayTasks={todayTasks}
              epics={epics}
              activeCount={activeTodayTasks.length}
              doneCount={doneTodayCount}
              totalLabel={totalDurationLabel(activeTodayTasks)}
              obstacles={obstacles}
              onObstaclesChange={setObstacles}
              onObstaclesBlur={handleObstaclesBlur}
            />
          ) : null}
        </div>

        <aside className="nordly-planning-timeline">
          {step === 'finalize' ? (
            <DayTimeline
              date={today}
              tasks={todayTasks}
              epics={epics}
              fitToHeight={false}
              className="nordly-day-timeline--planning"
              onReschedule={(task, start) => {
                void scheduleTask(task.id, start, defaultDurationMin(task))
                  .then(refresh)
                  .catch(handleLoadError);
              }}
              onDurationChange={(task, durationMin) => {
                const start = taskScheduleStart(task) ?? buildDefaultScheduleDate(today);
                void scheduleTask(task.id, start, durationMin)
                  .then(refresh)
                  .catch(handleLoadError);
              }}
            />
          ) : null}
        </aside>
      </div>
    </div>
  );
}
