export const NORDLY_CDN_DESKTOP_BASE = 'https://cdn.trynordly.app/desktop'

export const NORDLY_DOWNLOAD_PAGE = 'https://trynordly.app/download'

/** @deprecated use NORDLY_DOWNLOAD_PAGE */
export const NORDLY_RELEASES_PAGE = NORDLY_DOWNLOAD_PAGE

const RELEASES_JSON_URL = `${NORDLY_CDN_DESKTOP_BASE}/releases.json`
const CACHE_KEY = 'nordly:latest-release'
const CACHE_MS = 15 * 60 * 1000

export type NordlyReleaseInfo = {
  version: string
  tagName: string
  releasePageUrl: string
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
  return {
    version: o.version,
    tagName: o.tagName,
    releasePageUrl:
      typeof o.releasePageUrl === 'string' && o.releasePageUrl
        ? o.releasePageUrl
        : NORDLY_DOWNLOAD_PAGE,
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
  } catch {
    return null
  }
}

function writeCache(data: NordlyReleaseInfo): void {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data }))
  } catch {
    /* ignore quota */
  }
}

export async function fetchLatestNordlyRelease(): Promise<NordlyReleaseInfo | null> {
  const cached = readCache()
  if (cached) return cached

  try {
    const res = await fetch(RELEASES_JSON_URL, { cache: 'no-store' })
    if (!res.ok) return null
    const info = parseRelease(await res.json())
    if (info) writeCache(info)
    return info
  } catch {
    return null
  }
}

export async function detectMacArch(): Promise<'aarch64' | 'x64'> {
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
  } catch {
    /* ignore */
  }
  return 'aarch64'
}
