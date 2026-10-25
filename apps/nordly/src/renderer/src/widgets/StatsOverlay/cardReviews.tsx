import { useEffect, useState } from 'react';
import { useT } from '@nordly-i18n';
import { getCardStats, type CardStats } from '@features/cards/api/cardStats';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { BigCard, CardHead, BIG_NUMBER_STYLE, MetaLabel } from './primitives';

export function CardReviewsStats() {
  const t = useT();
  const [stats, setStats] = useState<CardStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let sequence = 0;
    const load = () => {
      const request = ++sequence;
      void getCardStats().then((data) => {
        if (!active || request !== sequence) return;
        setStats(data);
        setError(null);
      }).catch((failure: unknown) => {
        if (active && request === sequence) setError(failure instanceof Error ? failure.message : String(failure));
      });
    };
    load();
    window.addEventListener(NORDLY_EVENTS.cardsChanged, load);
    return () => { active = false; window.removeEventListener(NORDLY_EVENTS.cardsChanged, load); };
  }, []);
  return <BigCard>
    <CardHead title={t('nordly.cards.title')} />
    {error ? <p role="alert">{error}</p> : stats ? <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div><div style={BIG_NUMBER_STYLE}>{stats.todayReviewed}</div><MetaLabel>{t('nordly.stats.card_answers_today')}</MetaLabel></div>
        <div><div style={BIG_NUMBER_STYLE}>{stats.weekReviewed}</div><MetaLabel>{t('nordly.stats.last_7_days')}</MetaLabel></div>
      </div>
      <p style={{ margin: '12px 0 0', color: 'var(--ink-60)', fontSize: 12 }}>{t('nordly.stats.card_new_today')}: {stats.todayNew}</p>
    </> : <MetaLabel>{t('nordly.app.loading')}</MetaLabel>}
  </BigCard>;
}
