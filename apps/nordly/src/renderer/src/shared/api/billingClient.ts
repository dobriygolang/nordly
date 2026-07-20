import { API_BASE_URL } from '@shared/api/config';
import { syncAuthHeaders } from '@shared/api/authToken';
import { apiFetch } from '@shared/api/http';
import { optionalJsonNumber, requireJsonBoolean, requireJsonNumber, requireJsonObject, requireJsonString } from '@shared/api/json';

export const FEATURE_KEYS = [
  'cloud_sync_enabled',
  'cloud_sync_devices',
  'published_notes_active',
  'publish_password',
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export interface UsageLimitWire {
  used: number;
  limit: number | null;
  remaining: number | null;
  unlimited: boolean;
}

export interface BillingMe {
  userId: string;
  features: Record<string, boolean>;
  limits: Record<string, UsageLimitWire>;
}

function parseUsageLimit(raw: Record<string, unknown>): UsageLimitWire {
  const unlimited = requireJsonBoolean(raw, 'unlimited');
  const used = requireJsonNumber(raw, 'used');
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
  const rawFeatures = requireJsonObject(body, 'features');
  for (const [k, v] of Object.entries(rawFeatures)) {
    if (typeof v !== 'boolean') {
      throw new Error(`Invalid billing me: bad feature ${k}`);
    }
    features[k] = v;
  }

  const limits: Record<string, UsageLimitWire> = {};
  const rawLimits = requireJsonObject(body, 'limits');
  for (const [k, v] of Object.entries(rawLimits)) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) {
      throw new Error(`Invalid billing me: bad limit ${k}`);
    }
    limits[k] = parseUsageLimit(v as Record<string, unknown>);
  }

  return {
    userId: requireJsonString(body, 'userId'),
    features,
    limits,
  };
}

/** Current user features + usage limits (JWT). */
export async function fetchBillingMe(): Promise<BillingMe> {
  const resp = await apiFetch(`${API_BASE_URL}/v1/billing/me`, { headers: syncAuthHeaders() });
  if (!resp.ok) {
    throw new Error(`billing me: ${resp.status}`);
  }
  const body = (await resp.json()) as Record<string, unknown>;
  return parseBillingMe(body);
}

let billingMeCache: { expiresAt: number; value: BillingMe } | null = null;

/** Cached billing/me for UI menus (entitlements rarely change mid-session). */
export async function fetchBillingMeCached(ttlMs = 60_000): Promise<BillingMe> {
  const now = Date.now();
  if (billingMeCache && now < billingMeCache.expiresAt) {
    return billingMeCache.value;
  }
  const value = await fetchBillingMe();
  billingMeCache = { expiresAt: now + ttlMs, value };
  return value;
}
