import { useEffect, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { useI18n } from '@/lib/i18n'

function buildDeepLink(status: string, detail: string | null): string {
  const q = new URLSearchParams({ google_calendar: status })
  if (detail) q.set('detail', detail)
  return `nordly://settings?${q.toString()}`
}

export default function GoogleCalendarOAuthPage() {
  const { t } = useI18n()
  const [params] = useSearchParams()
  const status = params.get('google_calendar') ?? ''
  const detail = params.get('detail')
  const ok = status === 'connected'

  const deepLink = useMemo(
    () => (status ? buildDeepLink(status, detail) : null),
    [status, detail],
  )

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
        <h1 className="text-xl font-semibold">{t('oauth.google.missing')}</h1>
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
        {ok ? t('oauth.google.successTitle') : t('oauth.google.errorTitle')}
      </h1>
      <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
        {ok ? t('oauth.google.successBody') : detail ?? t('oauth.google.errorBody')}
      </p>
      {deepLink ? (
        <a
          href={deepLink}
          className="mt-8 inline-flex items-center justify-center rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
        >
          {t('oauth.google.openApp')}
        </a>
      ) : null}
      <p className="mt-6 text-xs text-neutral-500">{t('oauth.google.fallbackHint')}</p>
    </main>
  )
}
