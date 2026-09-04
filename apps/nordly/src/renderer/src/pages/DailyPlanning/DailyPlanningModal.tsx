import { useCallback, useEffect, useMemo, useRef } from 'react';

import { useT } from '@nordly-i18n';

import { DayTimeline } from '@features/tasks/components/DayTimeline';
import { useDailyPlanningModal } from '@features/planning/hooks/useDailyPlanningModal';
import { totalDurationLabel } from '@features/planning/lib/planningTasks';
import { PlanningStep } from '@features/planning/model/planningStep';
import { useDialogFocus } from '@shared/hooks/useDialogFocus';
import { zIndex } from '@shared/lib/z-index';
import { Icon } from '@shared/ui/primitives/Icon';

import { PickStep } from './steps/PickStep';
import { DeferStep } from './steps/DeferStep';
import { FinalizeStep, type FinalizeStepHandle } from './steps/FinalizeStep';

interface DailyPlanningModalProps {
  onClose: () => void;
  onComplete?: () => void;
  closing?: boolean;
  onRegisterFlush: (flush: (() => Promise<boolean>) | null) => void;
}

export function DailyPlanningModal({
  onClose,
  onComplete,
  closing = false,
  onRegisterFlush,
}: DailyPlanningModalProps): JSX.Element {
  const t = useT();
  const planning = useDailyPlanningModal({ onClose, onComplete });
  const finalizeRef = useRef<FinalizeStepHandle>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef);

  const flushObstacles = useCallback(async (): Promise<boolean> => {
    const latest = finalizeRef.current?.flush() ?? planning.obstaclesRef.current;
    return planning.flushObstacles(latest);
  }, [planning]);

  useEffect(() => {
    onRegisterFlush(flushObstacles);
    return () => onRegisterFlush(null);
  }, [flushObstacles, onRegisterFlush]);

  useEffect(() => {
    if (planning.loadError) {
      console.error('[nordly:planning] load failed', planning.loadError);
    }
  }, [planning.loadError]);

  const stepMeta = useMemo(() => {
    if (planning.step === PlanningStep.Pick) {
      return {
        title: t('nordly.planning.pick_title'),
        subtitle: t('nordly.planning.pick_subtitle'),
        action: t('nordly.planning.continue'),
        onAction: () => planning.setStep(PlanningStep.Defer),
        showBack: false,
      };
    }
    if (planning.step === PlanningStep.Defer) {
      return {
        title: t('nordly.planning.defer_title'),
        subtitle: t('nordly.planning.defer_subtitle'),
        action: t('nordly.planning.continue'),
        onAction: () => planning.setStep(PlanningStep.Finalize),
        showBack: true,
      };
    }
    return {
      title: t('nordly.planning.finalize_title'),
      subtitle: t('nordly.planning.finalize_subtitle'),
      action: t('nordly.planning.get_started'),
      onAction: () => {
        const latest = finalizeRef.current?.flush() ?? planning.obstaclesRef.current;
        void planning.handleFinalize(latest);
      },
      showBack: true,
    };
  }, [planning, t]);

  return (
    <div
      className="nordly-planning-backdrop fadein"
      data-closing={closing ? 'true' : undefined}
      style={{ zIndex: zIndex.modal }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className={`nordly-planning-modal motion-modal-in ${closing ? 'slide-to-right' : ''}`}
        data-step={planning.step}
        role="dialog"
        aria-modal="true"
        aria-label={t('nordly.planning.title')}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <aside className="nordly-planning-rail">
          <div className="nordly-planning-rail__copy">
            <h2 className="nordly-planning-rail__title">{stepMeta.title}</h2>
            <p className="nordly-planning-rail__subtitle">{stepMeta.subtitle}</p>
            {planning.loadError ? (
              <p className="nordly-planning-rail__subtitle" role="alert">
                {planning.loadError.message}
              </p>
            ) : null}
          </div>
          <div className="nordly-planning-rail__actions">
            <button
              type="button"
              className="nordly-planning-rail__back focus-ring"
              aria-label={t('nordly.planning.back')}
              disabled={!stepMeta.showBack}
              onClick={() =>
                planning.setStep(
                  planning.step === PlanningStep.Finalize ? PlanningStep.Defer : PlanningStep.Pick,
                )
              }
            >
              <Icon name="chevron-left" size={16} />
            </button>
            <button
              type="button"
              className="nordly-planning-rail__continue focus-ring"
              disabled={planning.finalizing}
              aria-busy={planning.finalizing || undefined}
              onClick={stepMeta.onAction}
            >
              {stepMeta.action}
            </button>
          </div>
        </aside>

        <div className="nordly-planning-main">
          {planning.step === PlanningStep.Pick ? (
            <PickStep
              todayKey={planning.todayKey}
              epics={planning.epics}
              settings={planning.trackerSettings}
              board={planning.board}
            />
          ) : null}
          {planning.step === PlanningStep.Defer ? (
            <DeferStep
              todayKey={planning.todayKey}
              epics={planning.epics}
              settings={planning.trackerSettings}
              board={planning.board}
            />
          ) : null}
          {planning.step === PlanningStep.Finalize ? (
            <FinalizeStep
              ref={finalizeRef}
              todayTasks={planning.todayTasks}
              epics={planning.epics}
              activeCount={planning.activeTodayTasks.length}
              doneCount={planning.doneTodayCount}
              totalLabel={totalDurationLabel(planning.activeTodayTasks)}
              obstacles={planning.obstacles}
              onObstaclesChange={(value) => {
                planning.obstaclesRef.current = value;
                planning.setObstacles(value);
              }}
              onObstaclesBlur={planning.handleObstaclesBlur}
              onObstaclesPersist={planning.persistObstacles}
            />
          ) : null}
        </div>

        <aside className="nordly-planning-timeline">
          {planning.step === PlanningStep.Pick || planning.step === PlanningStep.Finalize ? (
            <DayTimeline
              date={planning.today}
              tasks={planning.todayTasks}
              epics={planning.epics}
              fitToHeight={false}
              className="nordly-day-timeline--planning"
              onReschedule={(task, start) => {
                void planning.board.handleReschedule(task, start);
              }}
              onDurationChange={(task, durationMin) => {
                void planning.board.handleDurationChange(task, durationMin);
              }}
            />
          ) : null}
        </aside>
      </div>
    </div>
  );
}
