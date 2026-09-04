import { useT, useLocale } from '@nordly-i18n';

import {
  FocusStatsFetchStatus,
  useStatsOverlayData,
} from '@features/focus/hooks/useStatsOverlayData';
import { useRef } from 'react';

import { useDialogSurface } from '@shared/hooks/useDialogSurface';

import {
  BigCard,
  CardHead,
  HeatmapLegend,
  InsightsGrid,
  MetaLabel,
  ReferenceBars,
  ReferenceHeatmap,
  StreakCurve,
  TodayPlanReviewCard,
} from './StatsOverlay/cards';

export function StatsOverlayCards({
  onClose,
  closing = false,
}: {
  onClose: () => void;
  closing?: boolean;
}) {
  const t = useT();
  const [locale] = useLocale();
  const { state, data, lastSeven, sparkSeries } = useStatsOverlayData();
  const dialogRef = useRef<HTMLElement>(null);
  useDialogSurface(dialogRef, onClose, { active: !closing });

  return (
    <aside
      ref={dialogRef}
      className="nordly-stats-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t('nordly.stats.focus_activity')}
      tabIndex={-1}
    >
      <div className={closing ? 'slide-to-right' : 'slide-from-right'} style={{ animationDelay: closing ? '120ms' : '0ms' }}>
        <BigCard>
          <CardHead title={t('nordly.stats.focus_activity')} right={<HeatmapLegend />} />
          <ReferenceHeatmap days={data?.heatmap ?? []} />
        </BigCard>
      </div>

      <div className={closing ? 'slide-to-right' : 'slide-from-right'} style={{ animationDelay: closing ? '80ms' : '80ms' }}>
        <BigCard>
          <CardHead title={t('nordly.stats.current_streak')} />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              alignItems: 'end',
              gap: 18,
              marginTop: 4,
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 3 }}>
                <span
                  style={{
                    fontSize: 32,
                    fontWeight: 600,
                    letterSpacing: '-0.03em',
                    lineHeight: 1,
                    color: 'var(--ink)',
                  }}
                >
                  {data?.currentStreakDays ?? 0}
                </span>
                <span style={{ fontSize: 11, color: 'var(--ink-40)' }}>{t('nordly.stats.days')}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-40)' }}>
                {t('nordly.stats.longest')}{' '}
                <span style={{ color: 'var(--ink-90)' }}>{data?.longestStreakDays ?? 0}</span>
              </div>
            </div>
            <StreakCurve points={sparkSeries} />
          </div>
        </BigCard>
      </div>

      <div className={closing ? 'slide-to-right' : 'slide-from-right'} style={{ animationDelay: closing ? '40ms' : '160ms' }}>
        <BigCard>
          <CardHead
            title={t('nordly.stats.focused_time')}
            right={<MetaLabel>{t('nordly.stats.last_7_days').toUpperCase()}</MetaLabel>}
          />
          <ReferenceBars days={lastSeven} locale={locale} />
        </BigCard>
      </div>

      <div className={closing ? 'slide-to-right' : 'slide-from-right'} style={{ animationDelay: closing ? '0ms' : '240ms' }}>
        <BigCard>
          <CardHead title={t('nordly.stats.insights')} />
          <InsightsGrid data={data} t={t} />
        </BigCard>
      </div>

      <TodayPlanReviewCard closing={closing} t={t} />

      {state.status === FocusStatsFetchStatus.Unauthenticated && (
        <div
          className={`mono nordly-stats-card nordly-stats-notice ${closing ? 'slide-to-right' : 'slide-from-right'}`}
          style={{ animationDelay: closing ? '0ms' : '320ms' }}
        >
          {t('nordly.stats.sign_in_required').toUpperCase()}
        </div>
      )}
    </aside>
  );
}
