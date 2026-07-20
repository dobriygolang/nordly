export const NORDLY_DESKTOP_BASE = (
  import.meta.env.VITE_NORDLY_DESKTOP_BASE ?? '/desktop'
).replace(/\/$/, '')

export const NORDLY_DOWNLOAD_PATH = '/download'

const SITE_ORIGIN = (import.meta.env.VITE_SITE_ORIGIN ?? 'https://trynordly.app').replace(/\/$/, '')

export const NORDLY_DOWNLOAD_PAGE = `${SITE_ORIGIN}${NORDLY_DOWNLOAD_PATH}`

/** Absolute base for installer URLs in releases.json (CI publish script). */
export const NORDLY_DESKTOP_PUBLIC_BASE = NORDLY_DESKTOP_BASE.startsWith('http')
  ? NORDLY_DESKTOP_BASE
  : `${SITE_ORIGIN}${NORDLY_DESKTOP_BASE}`

const RELEASES_JSON_URL = `${NORDLY_DESKTOP_BASE}/releases.json`
const CACHE_KEY = 'nordly:latest-release'
const CACHE_MS = 15 * 60 * 1000

export type NordlyReleaseInfo = {
  version: string
  tagName: string
  downloadPageUrl: string
  macAarch64Url: string | null
  macX64Url: string | null
  windowsUrl: string | null
}

function parseRelease(body: unknown): NordlyReleaseInfo | null {
  if (!body || typeof body !== 'object') return null
  const o = body as Record<string, unknown>
  if (typeof o.version !== 'string' || !o.version) return null
  if (typeof o.tagName !== 'string' || !/^nordly-v/i.test(o.tagName)) return null
  const strOrNull = (v: unknown) => (typeof v === 'string' && v ? v : null)
  const downloadPage = strOrNull(o.downloadPageUrl)
  if (!downloadPage) return null
  return {
    version: o.version,
    tagName: o.tagName,
    downloadPageUrl: downloadPage,
    macAarch64Url: strOrNull(o.macAarch64Url),
    macX64Url: strOrNull(o.macX64Url),
    windowsUrl: strOrNull(o.windowsUrl),
  }
}

function readCache(): NordlyReleaseInfo | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const { at, data } = JSON.parse(raw) as { at: number; data: NordlyReleaseInfo }
    if (Date.now() - at > CACHE_MS) return null
    return data
  } catch (err) {
    console.warn('[nordlyRelease] cache read failed', err)
    return null
  }
}

function writeCache(data: NordlyReleaseInfo): void {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data }))
  } catch (err) {
    console.warn('[nordlyRelease] cache write failed', err)
  }
}

export async function fetchLatestNordlyRelease(): Promise<NordlyReleaseInfo | null> {
  const cached = readCache()
  if (cached) return cached

  try {
    const res = await fetch(RELEASES_JSON_URL, { cache: 'no-store' })
    if (!res.ok) {
      console.error(`[nordlyRelease] releases.json HTTP ${res.status}`)
      return null
    }
    const info = parseRelease(await res.json())
    if (!info) {
      console.error('[nordlyRelease] invalid releases.json payload')
      return null
    }
    writeCache(info)
    return info
  } catch (err) {
    console.error('[nordlyRelease] fetchLatestNordlyRelease failed', err)
    return null
  }
}

export async function detectMacArch(): Promise<'aarch64' | 'x64' | null> {
  try {
    const nav = navigator as Navigator & {
      userAgentData?: {
        getHighEntropyValues: (hints: string[]) => Promise<{ architecture?: string }>
      }
    }
    if (nav.userAgentData?.getHighEntropyValues) {
      const { architecture } = await nav.userAgentData.getHighEntropyValues(['architecture'])
      if (architecture === 'x86') return 'x64'
      if (architecture === 'arm') return 'aarch64'
    }
  } catch (err) {
    console.error('[nordlyRelease] detectMacArch failed', err)
  }
  return null
}
