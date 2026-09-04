import { useEffect, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { useI18n } from '@/lib/i18n'
import { OAuthStatus, sanitizeOAuthDetail, sanitizeOAuthStatus } from '@/lib/oauth/sanitize'

export const OAuthProvider = {
  GoogleCalendar: 'google_calendar',
  Zoom: 'zoom',
} as const
export type OAuthProviderId = (typeof OAuthProvider)[keyof typeof OAuthProvider]

const PROVIDER_COPY: Record<
  OAuthProviderId,
  {
    param: OAuthProviderId
    missing: string
    successTitle: string
    successBody: string
    errorTitle: string
    errorBody: string
    openApp: string
    fallbackHint: string
  }
> = {
  google_calendar: {
    param: 'google_calendar',
    missing: 'oauth.google.missing',
    successTitle: 'oauth.google.successTitle',
    successBody: 'oauth.google.successBody',
    errorTitle: 'oauth.google.errorTitle',
    errorBody: 'oauth.google.errorBody',
    openApp: 'oauth.google.openApp',
    fallbackHint: 'oauth.google.fallbackHint',
  },
  zoom: {
    param: 'zoom',
    missing: 'oauth.zoom.missing',
    successTitle: 'oauth.zoom.successTitle',
    successBody: 'oauth.zoom.successBody',
    errorTitle: 'oauth.zoom.errorTitle',
    errorBody: 'oauth.zoom.errorBody',
    openApp: 'oauth.zoom.openApp',
    fallbackHint: 'oauth.zoom.fallbackHint',
  },
}

export default function OAuthBridgePage({ provider }: { provider: OAuthProviderId }) {
  const { t } = useI18n()
  const [params] = useSearchParams()
  const copy = PROVIDER_COPY[provider]
  const status = sanitizeOAuthStatus(params.get(copy.param))
  const detail = sanitizeOAuthDetail(params.get('detail'))
  const ok = status === OAuthStatus.Connected

  const deepLink = useMemo(() => {
    if (!status) return null
    const q = new URLSearchParams({ [copy.param]: status })
    if (detail) q.set('detail', detail)
    return `nordly://settings?${q.toString()}`
  }, [copy.param, detail, status])

  useEffect(() => {
    if (!deepLink) return
    const timer = window.setTimeout(() => {
      window.location.href = deepLink
    }, 400)
    return () => window.clearTimeout(timer)
  }, [deepLink])

  if (!status) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center px-6 py-16 text-center">
        <h1 className="text-xl font-semibold">{t(copy.missing)}</h1>
        <p className="mt-3 text-sm text-neutral-500">
          <Link to="/" className="underline">
            {t('seo.goHome')}
          </Link>
        </p>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center px-6 py-16 text-center">
      <p className="text-xs uppercase tracking-wide text-neutral-500">Nordly</p>
      <h1 className="mt-2 text-2xl font-semibold">
        {ok ? t(copy.successTitle) : t(copy.errorTitle)}
      </h1>
      <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
        {ok ? t(copy.successBody) : detail ?? t(copy.errorBody)}
      </p>
      {deepLink ? (
        <a
          href={deepLink}
          className="mt-8 inline-flex items-center justify-center rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
        >
          {t(copy.openApp)}
        </a>
      ) : null}
      <p className="mt-6 text-xs text-neutral-500">{t(copy.fallbackHint)}</p>
    </main>
  )
}
