import type { BillingMe, PlanEntitlementKey } from '@shared/api/billingClient';
import type { DeviceRegistrationState } from '@shared/model/planUsage';

export type PlanMeterRow = {
  kind: 'meter';
  key: PlanEntitlementKey;
  used: number;
  limit: number | null;
  unlimited: boolean;
  exhausted: boolean;
};

export type PlanBoolRow = {
  kind: 'bool';
  key: PlanEntitlementKey;
  enabled: boolean;
};

export type PlanDisplayRow = PlanMeterRow | PlanBoolRow;

export interface PlanSnapshot {
  planSlug: string;
  planName: string;
  isPro: boolean;
  rows: PlanDisplayRow[];
}

const METER_KEYS: PlanEntitlementKey[] = [
  'cloud_sync_devices',
  'cloud_notes_count',
  'published_notes_active',
];

const BOOL_KEYS: PlanEntitlementKey[] = ['cloud_sync_enabled', 'publish_unlisted', 'publish_password'];

function isProPlan(slug: string): boolean {
  return slug !== 'free';
}

function meterFromEntitlements(
  me: BillingMe,
  key: PlanEntitlementKey,
  usedOverride: number | null,
  previewExhausted: boolean,
): PlanMeterRow | null {
  if (key === 'cloud_sync_devices' && me.features.cloud_sync_enabled === false) {
    return null;
  }

  const lim = me.limits[key];
  const unlimited = lim?.unlimited ?? false;
  const limit = lim?.limit ?? null;
  let used = usedOverride ?? lim?.used ?? 0;

  if (previewExhausted && !unlimited && limit != null) {
    used = limit;
  }

  const exhausted = !unlimited && limit != null && used >= limit;

  return { kind: 'meter', key, used, limit, unlimited, exhausted };
}

export function buildPlanSnapshot(input: {
  me: BillingMe;
  notesCount: number;
  publishedCount: number;
  deviceRegistration: DeviceRegistrationState | null;
  previewExhausted: boolean;
}): PlanSnapshot {
  const { me, notesCount, publishedCount, deviceRegistration, previewExhausted } = input;

  const usedForKey = (key: PlanEntitlementKey): number | null => {
    switch (key) {
      case 'cloud_notes_count':
        return notesCount;
      case 'published_notes_active':
        return publishedCount;
      case 'cloud_sync_devices':
        return deviceRegistration?.devicesRegistered ?? 0;
      default:
        return null;
    }
  };

  const rows: PlanDisplayRow[] = [];

  for (const key of BOOL_KEYS) {
    let enabled = me.features[key] ?? false;
    if (previewExhausted && key === 'cloud_sync_enabled') {
      enabled = false;
    }
    rows.push({ kind: 'bool', key, enabled });
  }

  for (const key of METER_KEYS) {
    const row = meterFromEntitlements(me, key, usedForKey(key), previewExhausted);
    if (row) rows.push(row);
  }

  return {
    planSlug: me.planSlug,
    planName: me.planName,
    isPro: isProPlan(me.planSlug),
    rows,
  };
}

export function meterLabel(
  row: PlanMeterRow,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  if (row.unlimited || row.limit == null) {
    return t('nordly.settings.plan.usage_unlimited', { used: row.used });
  }
  const remaining = Math.max(0, row.limit - row.used);
  return t('nordly.settings.plan.usage_remaining', {
    used: row.used,
    limit: row.limit,
    remaining,
  });
}

export function meterPercent(row: PlanMeterRow): number {
  if (row.unlimited || row.limit == null || row.limit <= 0) return 0;
  return Math.min(100, Math.round((row.used / row.limit) * 100));
}
