import { useT } from '@nordly-i18n';

import type { FeatureKey } from '@shared/api/billingClient';
import { useFeatureUsage } from '@features/usage/hooks/useFeatureUsage';
import {
  formatFeatureValue,
  type FeatureRow,
  type FeatureStatus,
} from '@shared/lib/featureUsage';

import { SettingRow, SettingsGroup } from '../primitives/SettingRow';

function featureHintKey(key: FeatureKey): string {
  return `nordly.settings.features.feature_hint.${key}`;
}

function featureLabelKey(key: FeatureKey): string {
  return `nordly.settings.features.entitlement.${key}`;
}

function FeatureValue({ status }: { status: FeatureStatus }): JSX.Element {
  const t = useT();
  const text = formatFeatureValue(status, t);
  const isMeter = status.kind === 'meter';
  return (
    <span
      className={`nordly-features-value${isMeter ? ' nordly-features-value--meter mono' : ''}${
        status.kind === 'disabled' ? ' nordly-features-value--disabled' : ''
      }`}
    >
      {text}
    </span>
  );
}

function FeatureRowItem({ feature }: { feature: FeatureRow }): JSX.Element {
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

export function FeaturesSection(): JSX.Element {
  const t = useT();
  const { snapshot, loading, error } = useFeatureUsage();

  return (
    <>
      <h1 className="nordly-settings-content__title">{t('nordly.settings.nav.features')}</h1>

      {loading ? <p className="nordly-features-status">{t('nordly.settings.features.loading')}</p> : null}
      {error === 'session' ? (
        <p className="nordly-features-status">{t('nordly.settings.features.session_required')}</p>
      ) : null}
      {error && error !== 'session' ? (
        <p className="nordly-features-status nordly-features-status--error">{error}</p>
      ) : null}

      {snapshot ? (
        <SettingsGroup title={t('nordly.settings.features.features_title')}>
          {snapshot.features.map((feature) => (
            <FeatureRowItem key={feature.key} feature={feature} />
          ))}
        </SettingsGroup>
      ) : null}
    </>
  );
}
