import type { TFunc } from '@nordly-i18n';

import { useTodayPlanReview } from '@features/planning/hooks/useTodayPlanReview';
import { BASELINE_ROW, BigCard, CardHead } from './primitives';

export function TodayPlanReviewCard({
  closing,
  t,
}: {
  closing: boolean;
  t: TFunc;
}): JSX.Element | null {
  const progress = useTodayPlanReview();
  if (!progress) return null;

  const percent =
    progress.total > 0
      ? Math.round((progress.done / progress.total) * 100)
      : 0;
  return (
    <div
      className={closing ? 'slide-to-right' : 'slide-from-right'}
      style={{ animationDelay: closing ? '0ms' : '320ms' }}
    >
      <BigCard>
        <CardHead title={t('nordly.stats.today_plan')} />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            marginTop: 4,
          }}
        >
          <div style={BASELINE_ROW}>
            <span
              style={{
                fontSize: 20,
                fontWeight: 700,
                letterSpacing: '-0.02em',
                color: 'var(--ink)',
              }}
            >
              {progress.done}/{progress.total}
            </span>
            <span style={{ fontSize: 10, color: 'var(--ink-40)' }}>
              {t('nordly.stats.today_plan_done')}
            </span>
          </div>
          <div
            aria-hidden="true"
            style={{
              position: 'relative',
              height: 4,
              overflow: 'hidden',
              background: 'var(--ink-tint-06)',
              borderRadius: 2,
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                width: `${percent}%`,
                background: 'var(--ink)',
                transition:
                  'width var(--motion-dur-cinematic) var(--motion-ease-standard)',
              }}
            />
          </div>
          <div style={{ fontSize: 10, color: 'var(--ink-40)' }}>
            {t('nordly.stats.today_plan_remaining', {
              count: progress.remaining,
            })}
          </div>
        </div>
      </BigCard>
    </div>
  );
}
