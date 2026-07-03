import type { BillingMe, PlanEntitlementKey } from '@shared/api/billingClient';
import type { DeviceRegistrationState } from '@shared/model/planUsage';

export type PlanFeatureStatus =
  | { kind: 'meter'; used: number; limit: number | null; unlimited: boolean }
  | { kind: 'included' }
  | { kind: 'pro' };

export type PlanFeature = {
  key: PlanEntitlementKey;
  status: PlanFeatureStatus;
};

export interface PlanSnapshot {
  planSlug: string;
  planName: string;
  isPro: boolean;
  features: PlanFeature[];
}

const FEATURE_ORDER: PlanEntitlementKey[] = [
  'published_notes_active',
  'cloud_sync_enabled',
  'cloud_sync_devices',
  'publish_password',
];

function publishedNotesFeature(
  me: BillingMe,
  publishedCount: number,
): PlanFeature {
  const lim = me.limits.published_notes_active;
  const unlimited = lim?.unlimited ?? false;
  const limit = lim?.limit ?? null;
  return {
    key: 'published_notes_active',
    status: { kind: 'meter', used: publishedCount, limit, unlimited },
  };
}

function boolFeature(me: BillingMe, key: PlanEntitlementKey): PlanFeature {
  const enabled = me.features[key] === true;
  return { key, status: enabled ? { kind: 'included' } : { kind: 'pro' } };
}

function devicesFeature(
  me: BillingMe,
  deviceRegistration: DeviceRegistrationState | null,
): PlanFeature | null {
  if (me.features.cloud_sync_enabled !== true) {
    return { key: 'cloud_sync_devices', status: { kind: 'pro' } };
  }
  const lim = me.limits.cloud_sync_devices;
  const unlimited = lim?.unlimited ?? false;
  const limit = lim?.limit ?? null;
  const used = deviceRegistration?.devicesRegistered ?? lim?.used ?? 0;
  return {
    key: 'cloud_sync_devices',
    status: { kind: 'meter', used, limit, unlimited },
  };
}

export function buildPlanSnapshot(input: {
  me: BillingMe;
  publishedCount: number;
  deviceRegistration: DeviceRegistrationState | null;
}): PlanSnapshot {
  const { me, publishedCount, deviceRegistration } = input;

  const features: PlanFeature[] = [];

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

  return {
    planSlug: me.planSlug,
    planName: me.planName,
    isPro: me.planSlug !== 'free',
    features,
  };
}

export function formatFeatureValue(
  status: PlanFeatureStatus,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  if (status.kind === 'included') return t('nordly.settings.plan.included');
  if (status.kind === 'pro') return t('nordly.settings.plan.pro_badge');
  if (status.unlimited || status.limit == null) {
    return t('nordly.settings.plan.meter_unlimited');
  }
  return t('nordly.settings.plan.meter', { used: status.used, limit: status.limit });
}
