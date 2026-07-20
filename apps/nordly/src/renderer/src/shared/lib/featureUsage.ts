import type { BillingMe, FeatureKey } from '@shared/api/billingClient';
import type { DeviceRegistrationState } from '@shared/model/featureUsage';

export type FeatureStatus =
  | { kind: 'meter'; used: number; limit: number | null; unlimited: boolean }
  | { kind: 'enabled' }
  | { kind: 'disabled' };

export type FeatureRow = {
  key: FeatureKey;
  status: FeatureStatus;
};

export interface FeatureUsageSnapshot {
  features: FeatureRow[];
}

const FEATURE_ORDER: FeatureKey[] = [
  'published_notes_active',
  'cloud_sync_enabled',
  'cloud_sync_devices',
  'publish_password',
];

function publishedNotesFeature(
  me: BillingMe,
  publishedCount: number,
): FeatureRow {
  const lim = me.limits.published_notes_active;
  if (!lim) {
    throw new Error('Invalid billing me: missing published_notes_active limit');
  }
  return {
    key: 'published_notes_active',
    status: { kind: 'meter', used: publishedCount, limit: lim.limit, unlimited: lim.unlimited },
  };
}

function boolFeature(me: BillingMe, key: FeatureKey): FeatureRow {
  const enabled = me.features[key] === true;
  return { key, status: enabled ? { kind: 'enabled' } : { kind: 'disabled' } };
}

function devicesFeature(
  me: BillingMe,
  deviceRegistration: DeviceRegistrationState | null,
): FeatureRow | null {
  if (me.features.cloud_sync_enabled !== true) {
    return { key: 'cloud_sync_devices', status: { kind: 'disabled' } };
  }
  const lim = me.limits.cloud_sync_devices;
  if (!lim) {
    throw new Error('Invalid billing me: missing cloud_sync_devices limit');
  }
  const used = deviceRegistration ? deviceRegistration.devicesRegistered : lim.used;
  return {
    key: 'cloud_sync_devices',
    status: { kind: 'meter', used, limit: lim.limit, unlimited: lim.unlimited },
  };
}

export function buildFeatureUsage(input: {
  me: BillingMe;
  publishedCount: number;
  deviceRegistration: DeviceRegistrationState | null;
}): FeatureUsageSnapshot {
  const { me, publishedCount, deviceRegistration } = input;

  const features: FeatureRow[] = [];

  for (const key of FEATURE_ORDER) {
    if (key === 'published_notes_active') {
      features.push(publishedNotesFeature(me, publishedCount));
      continue;
    }
    if (key === 'cloud_sync_devices') {
      const row = devicesFeature(me, deviceRegistration);
      if (row) features.push(row);
      continue;
    }
    features.push(boolFeature(me, key));
  }

  return { features };
}

export function formatFeatureValue(
  status: FeatureStatus,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  if (status.kind === 'enabled') return t('nordly.settings.features.yes');
  if (status.kind === 'disabled') return t('nordly.settings.features.no');
  if (status.unlimited || status.limit == null) {
    return t('nordly.settings.features.meter_unlimited');
  }
  return t('nordly.settings.features.meter', { used: status.used, limit: status.limit });
}
