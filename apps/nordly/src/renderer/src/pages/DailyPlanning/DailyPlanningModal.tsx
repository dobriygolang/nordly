import { useCallback, useEffect, useMemo, useState } from 'react';

import { useT } from '@nordly-i18n';

import { listTasks, scheduleTask, type TaskCard } from '@features/tasks/api/tasks';
import { getTrackerSettings, type TrackerSettings } from '@features/calendar/api/calendarClient';
import { LOCAL_ONLY } from '@app/config/features';
import { useTaskEpics } from '@features/tasks/lib/useTaskEpics';
import { DayTimeline } from '@pages/TaskBoard/DayTimeline';
import {
  defaultDurationMin,
  startOfLocalDay,
  sumDurationMin,
  toDayKey,
} from '@pages/TaskBoard/lib/dates';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { Icon } from '@shared/ui/primitives/Icon';
import { zIndex } from '@shared/lib/z-index';

import { finalizeDailyPlan, loadDailyPlan, saveDailyPlanObstacles } from './lib/dailyPlanStore';
import { tasksForToday, totalDurationLabel } from './lib/planningTasks';
import { usePlanningTaskBoard } from './lib/usePlanningTaskBoard';
import { PickStep } from './steps/PickStep';
import { DeferStep } from './steps/DeferStep';
import { FinalizeStep } from './steps/FinalizeStep';

export type PlanningStep = 'pick' | 'defer' | 'finalize';

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
  const today = useMemo(() => startOfLocalDay(new Date()), []);
  const todayKey = toDayKey(today);
  const { epics } = useTaskEpics();
  const [step, setStep] = useState<PlanningStep>('pick');
  const [tasks, setTasks] = useState<TaskCard[]>([]);
  const [obstacles, setObstacles] = useState('');
  const [trackerSettings, setTrackerSettings] = useState<TrackerSettings | null>(null);

  const refresh = useCallback(async () => {
    try {
      setTasks(await listTasks());
    } catch {
      /* keep stale */
    }
  }, []);

  useEffect(() => {
    void refresh();
    void loadDailyPlan(todayKey).then((rec) => setObstacles(rec.obstacles ?? ''));
  }, [refresh, todayKey]);

  useEffect(() => {
    if (LOCAL_ONLY) return;
    void getTrackerSettings()
      .then(setTrackerSettings)
      .catch(() => setTrackerSettings(null));
  }, []);

  useEffect(() => {
    const onTasksChanged = () => void refresh();
    window.addEventListener(NORDLY_EVENTS.tasksChanged, onTasksChanged);
    return () => window.removeEventListener(NORDLY_EVENTS.tasksChanged, onTasksChanged);
  }, [refresh]);

  const board = usePlanningTaskBoard({ todayKey, tasks, setTasks, refresh });

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
                void scheduleTask(task.id, start, defaultDurationMin(task)).then(refresh);
              }}
            />
          ) : null}
        </aside>
      </div>
    </div>
  );
}
