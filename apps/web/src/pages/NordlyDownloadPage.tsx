import { useEffect } from 'react'
import { RouteLoader } from '@/components/RouteLoader'
import {
  detectPlatform,
  isDirectInstallerUrl,
  NORDLY_DOWNLOAD_PATH,
  resolveDownloadUrl,
  triggerDownload,
} from '@/lib/landing/downloads'

/** Shareable link: trynordly.app/download → latest installer for this OS. */
export default function NordlyDownloadPage() {
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const url = await resolveDownloadUrl(detectPlatform())
      if (cancelled) return
      if (url && isDirectInstallerUrl(url)) {
        triggerDownload(url)
        return
      }
      window.location.replace(url ?? NORDLY_DOWNLOAD_PATH)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return <RouteLoader />
}
