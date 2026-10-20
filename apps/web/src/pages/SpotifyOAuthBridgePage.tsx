import { useEffect, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { useI18n } from '@/lib/i18n'

function sanitizeOAuthValue(raw: string | null): string | null {
  if (!raw) return null
  const value = raw.trim()
  if (!value || value.length > 1024) return null
  const hasControlCharacter = [...value].some((character) => {
    const codePoint = character.codePointAt(0)!
    return codePoint < 33 || codePoint === 127
  })
  return hasControlCharacter ? null : value
}

export default function SpotifyOAuthBridgePage() {
  const { t } = useI18n()
  const [params] = useSearchParams()
  const code = sanitizeOAuthValue(params.get('code'))
  const state = sanitizeOAuthValue(params.get('state'))
  const error = sanitizeOAuthValue(params.get('error'))
  const ok = Boolean(code && state)

  const deepLink = useMemo(() => {
    if (code && state) {
      return `nordly://settings?${new URLSearchParams({ code, state }).toString()}`
    }
    if (error && state) {
      return `nordly://settings?${new URLSearchParams({ error, state }).toString()}`
    }
    return null
  }, [code, error, state])

  useEffect(() => {
    if (!deepLink) return
    const timer = window.setTimeout(() => {
      window.location.href = deepLink
    }, 400)
    return () => window.clearTimeout(timer)
  }, [deepLink])

  if (!deepLink) {
    return (
      <main className="safe-x mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center py-16 text-center">
        <h1 className="text-xl font-semibold">{t('oauth.spotify.missing')}</h1>
        <p className="mt-3 text-sm text-neutral-500">
          <Link to="/" className="underline">
            {t('seo.goHome')}
          </Link>
        </p>
      </main>
    )
  }

  return (
    <main className="safe-x mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center py-16 text-center">
      <p className="text-xs uppercase tracking-wide text-neutral-500">Nordly</p>
      <h1 className="mt-2 text-2xl font-semibold">
        {ok ? t('oauth.spotify.successTitle') : t('oauth.spotify.errorTitle')}
      </h1>
      <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
        {ok ? t('oauth.spotify.successBody') : t('oauth.spotify.errorBody')}
      </p>
      <a
        href={deepLink}
        className="mt-8 inline-flex items-center justify-center rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
      >
        {t('oauth.spotify.openApp')}
      </a>
      <p className="mt-6 text-xs text-neutral-500">{t('oauth.spotify.fallbackHint')}</p>
    </main>
  )
}
