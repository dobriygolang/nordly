import { useQuery } from '@tanstack/react-query'
import { Eyebrow } from '@/components/brand/Eyebrow'
import { formatPlanLimitSpec, planLimitKeys } from '@/lib/billing/planLimits'
import { getBillingPlans } from '@/lib/api/billing'
import { useBillingLabels } from '@/lib/billingLabels'
import { ErrorMessage } from '@/components/ErrorMessage'
import { PageContent } from '@/components/PageContent'
import { formatApiError } from '@/lib/apiClient'
import { useI18n } from '@/lib/i18n'

export default function PricingPage() {
  const { t } = useI18n()
  const { entitlementLabel } = useBillingLabels()
  const plansQ = useQuery({
    queryKey: ['billing-plans'],
    queryFn: getBillingPlans,
    staleTime: 5 * 60_000,
  })

  const plans = plansQ.data?.plans ?? []
  const limitKeys = planLimitKeys(plans)

  return (
    <PageContent>
        <header className="text-center">
          <Eyebrow className="text-site-muted">{t('pricing.eyebrow')}</Eyebrow>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-site-text sm:text-4xl">
            {t('pricing.title')}
          </h1>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-site-muted">{t('pricing.subtitle')}</p>
        </header>

        {plansQ.isError ? (
          <ErrorMessage message={formatApiError(plansQ.error)} onRetry={() => void plansQ.refetch()} />
        ) : null}

        {plansQ.isLoading ? (
          <div className="h-64 animate-pulse rounded-2xl border border-site-border bg-site-surface" />
        ) : null}

        {!plansQ.isLoading && plans.length > 0 ? (
          <div className="overflow-x-auto rounded-2xl border border-site-border bg-site-card">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-site-border">
                  <th className="px-5 py-4 font-medium text-site-muted">{t('pricing.limitColumn')}</th>
                  {plans.map((plan) => (
                    <th key={plan.slug} className="px-5 py-4 align-top">
                      <div className="font-semibold text-site-text">{plan.name}</div>
                      {plan.tagline ? (
                        <p className="mt-1 max-w-[12rem] text-xs font-normal leading-snug text-site-muted">
                          {plan.tagline}
                        </p>
                      ) : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {limitKeys.map((key) => (
                  <tr key={key} className="border-b border-site-border last:border-b-0">
                    <td className="px-5 py-3.5 text-site-text">{entitlementLabel(key)}</td>
                    {plans.map((plan) => (
                      <td key={`${plan.slug}-${key}`} className="px-5 py-3.5 text-site-muted">
                        {formatPlanLimitSpec(plan.limits?.[key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <p className="text-center text-sm text-site-muted">{t('pricing.desktopNote')}</p>
      </PageContent>
  )
}
