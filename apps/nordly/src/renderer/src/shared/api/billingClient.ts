import { API_BASE_URL } from '@shared/api/config';
import { syncAuthHeaders } from '@shared/api/authToken';
import { apiFetch } from '@shared/api/http';
import { optionalJsonNumber, requireJsonBoolean, requireJsonString } from '@shared/api/json';

export const PLAN_ENTITLEMENT_KEYS = [
  'cloud_sync_enabled',
  'cloud_sync_devices',
  'cloud_notes_count',
  'published_notes_active',
  'publish_unlisted',
  'publish_password',
] as const;

export type PlanEntitlementKey = (typeof PLAN_ENTITLEMENT_KEYS)[number];

export interface UsageLimitWire {
  used: number;
  limit: number | null;
  remaining: number | null;
  unlimited: boolean;
}

export interface BillingMe {
  userId: string;
  planSlug: string;
  planName: string;
  features: Record<string, boolean>;
  limits: Record<string, UsageLimitWire>;
  isTrialing: boolean;
  trialAvailable: boolean;
  trialDays: number;
}

function parseUsageLimit(raw: Record<string, unknown>): UsageLimitWire {
  const unlimited = requireJsonBoolean(raw, 'unlimited');
  const used = optionalJsonNumber(raw, 'used') ?? 0;
  const limit = optionalJsonNumber(raw, 'limit');
  const remaining = optionalJsonNumber(raw, 'remaining');
  return {
    used,
    limit: limit ?? null,
    remaining: remaining ?? null,
    unlimited,
  };
}

function parseBillingMe(body: Record<string, unknown>): BillingMe {
  const features: Record<string, boolean> = {};
  const rawFeatures = body.features;
  if (rawFeatures && typeof rawFeatures === 'object' && !Array.isArray(rawFeatures)) {
    for (const [k, v] of Object.entries(rawFeatures as Record<string, unknown>)) {
      if (typeof v === 'boolean') features[k] = v;
    }
  }

  const limits: Record<string, UsageLimitWire> = {};
  const rawLimits = body.limits;
  if (rawLimits && typeof rawLimits === 'object' && !Array.isArray(rawLimits)) {
    for (const [k, v] of Object.entries(rawLimits as Record<string, unknown>)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        limits[k] = parseUsageLimit(v as Record<string, unknown>);
      }
    }
  }

  return {
    userId: requireJsonString(body, 'userId'),
    planSlug: requireJsonString(body, 'planSlug'),
    planName: requireJsonString(body, 'planName'),
    features,
    limits,
    isTrialing: body.isTrialing === true,
    trialAvailable: body.trialAvailable === true,
    trialDays: optionalJsonNumber(body, 'trialDays') ?? 0,
  };
}

/** Current user plan + entitlements (JWT). */
export async function fetchBillingMe(): Promise<BillingMe> {
  const resp = await apiFetch(`${API_BASE_URL}/v1/billing/me`, { headers: syncAuthHeaders() });
  if (!resp.ok) {
    throw new Error(`billing me: ${resp.status}`);
  }
  const body = (await resp.json()) as Record<string, unknown>;
  return parseBillingMe(body);
}

export function pricingPageUrl(): string {
  const webBase = (import.meta.env.VITE_NORDLY_WEB_BASE as string | undefined)?.trim();
  const base = webBase && webBase.length > 0 ? webBase.replace(/\/$/, '') : 'https://trynordly.app';
  return `${base}/pricing`;
}

export function openPricingPage(): void {
  const url = pricingPageUrl();
  const open = window.nordly?.shell.openExternal;
  if (open) {
    void open(url);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}
