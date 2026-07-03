import { API_BASE_URL } from '@shared/api/config';
import { syncAuthHeaders } from '@shared/api/authToken';
import { apiFetch } from '@shared/api/http';
import { optionalJsonNumber, requireJsonBoolean, requireJsonString } from '@shared/api/json';

let cachedProCheckoutUrl: string | null | undefined;

export interface BillingPlanCatalog {
  slug: string;
  name: string;
  checkoutUrl: string | null;
  telegramCheckoutUrl: string | null;
}

export const PLAN_ENTITLEMENT_KEYS = [
  'cloud_sync_enabled',
  'cloud_sync_devices',
  'published_notes_active',
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

function openExternalUrl(url: string): void {
  const open = window.nordly?.shell.openExternal;
  if (open) {
    void open(url);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** Public plan catalog (includes Tribute checkout URLs). */
export async function fetchBillingPlans(): Promise<BillingPlanCatalog[]> {
  const resp = await apiFetch(`${API_BASE_URL}/v1/billing/plans`);
  if (!resp.ok) throw new Error(`billing plans: ${resp.status}`);
  const body = (await resp.json()) as Record<string, unknown>;
  const rawPlans = body.plans;
  if (!Array.isArray(rawPlans)) throw new Error('billing plans: missing plans');
  return rawPlans.map((item) => {
    if (!item || typeof item !== 'object') throw new Error('billing plans: invalid plan');
    const plan = item as Record<string, unknown>;
    const checkoutUrl = typeof plan.checkoutUrl === 'string' ? plan.checkoutUrl : null;
    const telegramCheckoutUrl =
      typeof plan.telegramCheckoutUrl === 'string' ? plan.telegramCheckoutUrl : null;
    return {
      slug: requireJsonString(plan, 'slug'),
      name: requireJsonString(plan, 'name'),
      checkoutUrl,
      telegramCheckoutUrl,
    };
  });
}

/** Tribute web checkout for Pro (falls back to /pricing). */
export async function resolveProCheckoutUrl(): Promise<string> {
  if (cachedProCheckoutUrl !== undefined) {
    return cachedProCheckoutUrl ?? pricingPageUrl();
  }
  try {
    const plans = await fetchBillingPlans();
    const pro =
      plans.find((p) => p.slug === 'pro_monthly') ??
      plans.find((p) => p.slug !== 'free' && p.checkoutUrl);
    cachedProCheckoutUrl = pro?.checkoutUrl ?? null;
  } catch {
    cachedProCheckoutUrl = null;
  }
  return cachedProCheckoutUrl ?? pricingPageUrl();
}

export function openPricingPage(): void {
  openExternalUrl(pricingPageUrl());
}

/** Open Tribute checkout when configured, otherwise pricing page. */
export function openProCheckout(): void {
  void resolveProCheckoutUrl().then(openExternalUrl);
}
