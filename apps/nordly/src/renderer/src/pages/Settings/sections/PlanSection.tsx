import { useCallback, useEffect, useState } from 'react';

import { useT } from '@nordly-i18n';

import { openPricingPage } from '@shared/api/billingClient';
import { usePlanSnapshot } from '@features/plan/hooks/usePlanSnapshot';
import { meterLabel, meterPercent, type PlanDisplayRow } from '@shared/lib/planSnapshot';
import { patchSettings, readSettings } from '@shared/model/settings';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';

import { SettingRow, SettingsBlock, SettingsGroup } from '../primitives/SettingRow';
import { Toggle } from '../primitives/Toggle';

function entitlementLabelKey(key: string): string {
  return `nordly.settings.plan.entitlement.${key}`;
}

function PlanRow({ row }: { row: PlanDisplayRow }): JSX.Element {
  const t = useT();
  const label = t(entitlementLabelKey(row.key));

  if (row.kind === 'bool') {
    return (
      <SettingRow
        label={label}
        hint={row.enabled ? t('nordly.settings.plan.included') : t('nordly.settings.plan.pro_only')}
      >
        <span
          className={`nordly-plan-badge${row.enabled ? ' nordly-plan-badge--on' : ' nordly-plan-badge--off'}`}
        >
          {row.enabled ? t('nordly.settings.plan.yes') : t('nordly.settings.plan.no')}
        </span>
      </SettingRow>
    );
  }

  const pct = meterPercent(row);
  return (
    <div className={`nordly-plan-meter${row.exhausted ? ' nordly-plan-meter--exhausted' : ''}`}>
      <div className="nordly-plan-meter__head">
        <span className="nordly-plan-meter__label">{label}</span>
        <span className="nordly-plan-meter__value mono">{meterLabel(row, t)}</span>
      </div>
      {!row.unlimited && row.limit != null ? (
        <div className="nordly-plan-meter__track" aria-hidden>
          <div className="nordly-plan-meter__fill" style={{ width: `${pct}%` }} />
        </div>
      ) : null}
      {row.exhausted ? (
        <p className="nordly-plan-meter__exhausted">{t('nordly.settings.plan.limit_reached')}</p>
      ) : null}
    </div>
  );
}

export function PlanSection(): JSX.Element {
  const t = useT();
  const { snapshot, loading, error, refresh } = usePlanSnapshot();
  const [previewExhausted, setPreviewExhausted] = useState(() => readSettings().planPreviewExhausted);

  useEffect(() => {
    const onSettings = (): void => setPreviewExhausted(readSettings().planPreviewExhausted);
    window.addEventListener(NORDLY_EVENTS.settingsChanged, onSettings);
    return () => window.removeEventListener(NORDLY_EVENTS.settingsChanged, onSettings);
  }, []);

  const togglePreview = useCallback((on: boolean) => {
    patchSettings({ planPreviewExhausted: on });
    setPreviewExhausted(on);
  }, []);

  return (
    <>
      <h1 className="nordly-settings-content__title">{t('nordly.settings.nav.plan')}</h1>

      <SettingsBlock title={t('nordly.settings.section.plan')}>
        {loading ? <p className="nordly-plan-status">{t('nordly.settings.plan.loading')}</p> : null}
        {error === 'session' ? (
          <p className="nordly-plan-status">{t('nordly.settings.plan.session_required')}</p>
        ) : null}
        {error && error !== 'session' ? (
          <p className="nordly-plan-status nordly-plan-status--error">{error}</p>
        ) : null}

        {snapshot ? (
          <>
            <div className="nordly-plan-header">
              <div>
                <p className="nordly-plan-header__eyebrow mono">{t('nordly.settings.plan.current')}</p>
                <p className="nordly-plan-header__name">{snapshot.planName}</p>
              </div>
              {!snapshot.isPro ? (
                <button
                  type="button"
                  className="nordly-settings-change-btn focus-ring"
                  onClick={() => openPricingPage()}
                >
                  {t('nordly.settings.plan.upgrade')}
                </button>
              ) : (
                <button
                  type="button"
                  className="nordly-settings-change-btn focus-ring"
                  onClick={() => openPricingPage()}
                >
                  {t('nordly.settings.plan.view_pricing')}
                </button>
              )}
            </div>

            {previewExhausted ? (
              <p className="nordly-plan-preview-note">{t('nordly.settings.plan.preview_active')}</p>
            ) : null}

            <div className="nordly-plan-rows">
              {snapshot.rows.map((row) => (
                <PlanRow key={row.key} row={row} />
              ))}
            </div>
          </>
        ) : null}
      </SettingsBlock>

      <SettingsGroup title={t('nordly.settings.plan.preview_group')}>
        <SettingRow
          label={t('nordly.settings.plan.preview_label')}
          hint={t('nordly.settings.plan.preview_hint')}
        >
          <Toggle
            value={previewExhausted}
            onChange={togglePreview}
            label={
              previewExhausted
                ? t('nordly.settings.plan.preview_on')
                : t('nordly.settings.plan.preview_off')
            }
          />
        </SettingRow>
        <SettingRow label={t('nordly.settings.plan.refresh_label')} hint={t('nordly.settings.plan.refresh_hint')}>
          <button
            type="button"
            className="nordly-settings-change-btn focus-ring"
            onClick={() => void refresh()}
            disabled={loading}
          >
            {t('nordly.settings.plan.refresh')}
          </button>
        </SettingRow>
      </SettingsGroup>
    </>
  );
}
