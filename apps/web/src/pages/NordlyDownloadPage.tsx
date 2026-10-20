import { useEffect, useState } from 'react'
import { RouteLoader } from '@/components/RouteLoader'
import { useI18n } from '@/lib/i18n'
import {
  detectPlatform,
  isDirectInstallerUrl,
  isHandheldDevice,
  resolveDownloadUrl,
  triggerDownload,
} from '@/lib/landing/downloads'
import { fetchLatestNordlyRelease, type NordlyReleaseInfo } from '@/lib/landing/nordlyRelease'

type PageState =
  | { kind: 'loading' }
  | { kind: 'ready'; started: boolean; release: NordlyReleaseInfo | null }

/** Shareable link: trynordly.app/download → latest installer, or an OS picker. */
export default function NordlyDownloadPage() {
  const { t } = useI18n()
  const [state, setState] = useState<PageState>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [url, release] = await Promise.all([
        resolveDownloadUrl(detectPlatform()),
        fetchLatestNordlyRelease(),
      ])
      if (cancelled) return
      const started = Boolean(url && isDirectInstallerUrl(url))
      if (started && url) triggerDownload(url)
      setState({ kind: 'ready', started, release })
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (state.kind === 'loading') return <RouteLoader />

  const links = [
    { label: t('welcome.downloadMacApple'), url: state.release?.macAarch64Url },
    { label: t('welcome.downloadMacIntel'), url: state.release?.macX64Url },
    { label: t('welcome.downloadWindows'), url: state.release?.windowsUrl },
  ].filter((row): row is { label: string; url: string } =>
    Boolean(row.url && isDirectInstallerUrl(row.url)),
  )

  return (
    <section className="safe-x mx-auto flex max-w-xl flex-1 flex-col justify-center py-16 sm:py-24">
      <h1 className="text-3xl font-bold tracking-tight text-site-text">{t('welcome.downloadTitle')}</h1>
      <p className="mt-4 text-site-muted">
        {state.started ? t('welcome.downloadStarted') : t('welcome.downloadPickOs')}
      </p>
      {isHandheldDevice() ? (
        <p className="mt-3 text-sm leading-relaxed text-site-muted">{t('welcome.downloadMobileNote')}</p>
      ) : null}
      {links.length > 0 ? (
        <ul className="mt-8 flex flex-col gap-3">
          {links.map((row) => (
            <li key={row.url}>
              <button
                type="button"
                onClick={() => triggerDownload(row.url)}
                className="inline-flex w-full items-center justify-center rounded-md bg-site-accent px-6 py-3 text-sm font-medium text-site-accent-fg transition-opacity hover:opacity-90 sm:w-auto"
              >
                {row.label}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-8 text-site-muted">{t('welcome.downloadUnavailable')}</p>
      )}
    </section>
  )
}
