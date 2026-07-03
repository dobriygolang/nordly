import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  detectPlatform,
  isDirectInstallerUrl,
  NORDLY_DOWNLOAD_PATH,
  resolveDownloadUrl,
  triggerDownload,
} from '@/lib/landing/downloads'
import { fetchLatestNordlyRelease } from '@/lib/landing/nordlyRelease'
import { useI18n } from '@/lib/i18n'

type LandingDownloadContextValue = {
  preparing: boolean
  downloaded: boolean
  label: string
  version: string | null
  onDownload: () => void
}

const LandingDownloadContext = createContext<LandingDownloadContextValue | null>(null)

export function LandingDownloadProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  const platform = useMemo(() => detectPlatform(), [])
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [version, setVersion] = useState<string | null>(null)
  const [downloaded, setDownloaded] = useState(false)
  const preparing = !downloadUrl

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [url, release] = await Promise.all([
        resolveDownloadUrl(platform),
        fetchLatestNordlyRelease(),
      ])
      if (cancelled) return
      setDownloadUrl(url ?? NORDLY_DOWNLOAD_PATH)
      setVersion(release?.version ?? null)
    })()
    return () => {
      cancelled = true
    }
  }, [platform])

  const label = downloaded
    ? t('welcome.downloadStarted')
    : preparing
      ? t('welcome.preparingDownload')
      : version
        ? t('welcome.downloadCtaVersion', { version })
        : t('welcome.downloadCta')

  const onDownload = useCallback(() => {
    if (!downloadUrl) return
    if (isDirectInstallerUrl(downloadUrl)) {
      triggerDownload(downloadUrl)
      setDownloaded(true)
      return
    }
    window.location.assign(downloadUrl)
  }, [downloadUrl])

  const value = useMemo(
    () => ({ preparing, downloaded, label, version, onDownload }),
    [preparing, downloaded, label, version, onDownload],
  )

  return <LandingDownloadContext.Provider value={value}>{children}</LandingDownloadContext.Provider>
}

export function useLandingDownload() {
  const ctx = useContext(LandingDownloadContext)
  if (!ctx) throw new Error('useLandingDownload must be used within LandingDownloadProvider')
  return ctx
}
