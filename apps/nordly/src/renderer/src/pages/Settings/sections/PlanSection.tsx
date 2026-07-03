import { useT } from '@nordly-i18n';

import { openProCheckout, openPricingPage } from '@shared/api/billingClient';
import type { PlanEntitlementKey } from '@shared/api/billingClient';
import { usePlanSnapshot } from '@features/plan/hooks/usePlanSnapshot';
import {
  formatFeatureValue,
  type PlanFeature,
  type PlanFeatureStatus,
} from '@shared/lib/planSnapshot';

import { SettingRow, SettingsGroup } from '../primitives/SettingRow';

function featureHintKey(key: PlanEntitlementKey): string {
  return `nordly.settings.plan.feature_hint.${key}`;
}

function featureLabelKey(key: PlanEntitlementKey): string {
  return `nordly.settings.plan.entitlement.${key}`;
}

function FeatureValue({ status }: { status: PlanFeatureStatus }): JSX.Element {
  const t = useT();
  const text = formatFeatureValue(status, t);
  const isMeter = status.kind === 'meter';
  return (
    <span
      className={`nordly-plan-value${isMeter ? ' nordly-plan-value--meter mono' : ''}${
        status.kind === 'pro' ? ' nordly-plan-value--pro' : ''
      }`}
    >
      {text}
    </span>
  );
}

function PlanFeatureRow({ feature }: { feature: PlanFeature }): JSX.Element {
  const t = useT();
  return (
    <SettingRow
      label={t(featureLabelKey(feature.key))}
      hint={t(featureHintKey(feature.key))}
    >
      <FeatureValue status={feature.status} />
    </SettingRow>
  );
}

export function PlanSection(): JSX.Element {
  const t = useT();
  const { snapshot, loading, error } = usePlanSnapshot();

  return (
    <>
      <h1 className="nordly-settings-content__title">{t('nordly.settings.nav.plan')}</h1>

      {loading ? <p className="nordly-plan-status">{t('nordly.settings.plan.loading')}</p> : null}
      {error === 'session' ? (
        <p className="nordly-plan-status">{t('nordly.settings.plan.session_required')}</p>
      ) : null}
      {error && error !== 'session' ? (
        <p className="nordly-plan-status nordly-plan-status--error">{error}</p>
      ) : null}

      {snapshot ? (
        <>
          <p className="nordly-plan-subtitle">{snapshot.planName}</p>

          <SettingsGroup title={t('nordly.settings.plan.features_title')}>
            {snapshot.features.map((feature) => (
              <PlanFeatureRow key={feature.key} feature={feature} />
            ))}
          </SettingsGroup>

          <div className="nordly-plan-actions">
            {!snapshot.isPro ? (
              <SettingRow
                label={t('nordly.settings.plan.pro')}
                hint={t('nordly.settings.plan.upgrade_hint')}
              >
                <button
                  type="button"
                  className="nordly-settings-change-btn focus-ring"
                  onClick={() => openProCheckout()}
                >
                  {t('nordly.settings.plan.view_pricing')}
                </button>
              </SettingRow>
            ) : (
              <SettingRow
                label={t('nordly.settings.plan.manage')}
                hint={t('nordly.settings.plan.manage_hint')}
              >
                <button
                  type="button"
                  className="nordly-settings-change-btn focus-ring"
                  onClick={() => openPricingPage()}
                >
                  {t('nordly.settings.plan.view_pricing')}
                </button>
              </SettingRow>
            )}
          </div>
        </>
      ) : null}
    </>
  );
}
