import { useEffect } from 'react'
import { RouteLoader } from '@/components/RouteLoader'
import { detectPlatform, NORDLY_RELEASES_PAGE, resolveDownloadUrl } from '@/lib/landing/downloads'

/** Shareable link: trynordly.app/download → latest installer for this OS. */
export default function NordlyDownloadPage() {
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const url = await resolveDownloadUrl(detectPlatform())
      if (cancelled) return
      window.location.replace(url ?? NORDLY_RELEASES_PAGE)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return <RouteLoader />
}
