import { api } from '@/lib/apiClient'
import { asArray } from '@/lib/api/normalize'
import type { PlanCatalogEntry } from '@/lib/types'

export function getBillingPlans() {
  return api<{ plans: PlanCatalogEntry[] }>('/billing/plans').then((res) => ({
    plans: asArray(res.plans).map(normalizePlanCatalog),
  }))
}

function normalizePlanCatalog(raw: PlanCatalogEntry): PlanCatalogEntry {
  return {
    slug: raw.slug,
    name: raw.name,
    tagline: raw.tagline ?? '',
    limits: raw.limits ?? {},
  }
}
