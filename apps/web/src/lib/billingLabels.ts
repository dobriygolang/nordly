import { useMemo } from 'react'
import { useI18n } from '@/lib/i18n'

type TFn = (key: string, vars?: Record<string, string | number>) => string

function entitlementLabelWith(t: TFn, key: string): string {
  const label = t(`billing.counters.${key}`)
  if (label !== `billing.counters.${key}`) return label
  return humanizeEntitlementKey(key)
}

export function useBillingLabels() {
  const { t } = useI18n()
  return useMemo(
    () => ({
      entitlementLabel: (key: string) => entitlementLabelWith(t, key),
    }),
    [t],
  )
}

function humanizeEntitlementKey(key: string): string {
  return key
    .replace(/_per_day$/, '')
    .replace(/_per_month$/, '')
    .replace(/_enabled$/, '')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}
