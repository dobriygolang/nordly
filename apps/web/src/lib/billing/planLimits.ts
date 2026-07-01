import type { PlanCatalogEntry, PlanEntitlementSpec } from '@/lib/types'

const LIMIT_DISPLAY_ORDER = [
  'cloud_notes_count',
  'code_runs_per_day',
  'live_rooms_per_month',
  'live_rooms_concurrent',
  'focus_stats_history_days',
] as const

export function planLimitKeys(plans: PlanCatalogEntry[]): string[] {
  const keys = new Set<string>()
  for (const plan of plans) {
    for (const key of Object.keys(plan.limits ?? {})) {
      keys.add(key)
    }
  }
  const order = new Map(LIMIT_DISPLAY_ORDER.map((k, i) => [k, i]))
  return [...keys].sort((a, b) => {
    const ia = order.get(a as (typeof LIMIT_DISPLAY_ORDER)[number]) ?? 999
    const ib = order.get(b as (typeof LIMIT_DISPLAY_ORDER)[number]) ?? 999
    if (ia !== ib) return ia - ib
    return a.localeCompare(b)
  })
}

export function formatPlanLimitSpec(spec: PlanEntitlementSpec | undefined): string {
  if (!spec) return '—'
  if (spec.type === 'bool') return spec.value ? 'Yes' : 'No'
  if (spec.unlimited || spec.limit == null) return 'Unlimited'
  const suffix =
    spec.period === 'day' ? '/day' : spec.period === 'month' ? '/month' : spec.period ? `/${spec.period}` : ''
  return `${spec.limit}${suffix}`
}
