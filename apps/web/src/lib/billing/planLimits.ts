import type { PlanCatalogEntry, PlanEntitlementSpec } from '@/lib/types'

/** Rows shown on /pricing — order matches product docs. */
const PRICING_DISPLAY_ORDER = [
  'cloud_sync_enabled',
  'cloud_sync_devices',
  'published_notes_active',
  'publish_password',
] as const

export type PricingEntitlementKey = (typeof PRICING_DISPLAY_ORDER)[number]

export function planPricingKeys(plans: PlanCatalogEntry[]): string[] {
  return PRICING_DISPLAY_ORDER.filter((key) =>
    plans.some((plan) => plan.limits?.[key] != null || plan.features?.[key] !== undefined),
  )
}

export function formatPlanEntitlementValue(
  plan: PlanCatalogEntry,
  key: string,
  t: (msgKey: string) => string,
): string {
  if (plan.features && key in plan.features) {
    return plan.features[key] ? t('pricing.yes') : t('pricing.no')
  }
  return formatPlanLimitSpec(plan.limits?.[key], t)
}

export function formatPlanLimitSpec(
  spec: PlanEntitlementSpec | undefined,
  t: (msgKey: string) => string,
): string {
  if (!spec) return '—'
  if (spec.type === 'bool') return spec.value ? t('pricing.yes') : t('pricing.no')
  if (spec.unlimited || spec.limit == null) return t('pricing.unlimited')
  const suffix =
    spec.period === 'day' ? '/day' : spec.period === 'month' ? '/month' : spec.period ? `/${spec.period}` : ''
  return `${spec.limit}${suffix}`
}
