export const NORDLY_REPO = 'dobriygolang/nordly'

export const NORDLY_RELEASES_PAGE = `https://github.com/${NORDLY_REPO}/releases/latest`

const GITHUB_LATEST_API = `https://api.github.com/repos/${NORDLY_REPO}/releases/latest`
const CACHE_KEY = 'nordly:latest-release'
const CACHE_MS = 15 * 60 * 1000

type GitHubAsset = { name: string; browser_download_url: string }
type GitHubRelease = {
  tag_name: string
  html_url: string
  assets: GitHubAsset[]
}

export type NordlyReleaseInfo = {
  version: string
  tagName: string
  releasePageUrl: string
  macAarch64Url: string | null
  macX64Url: string | null
  windowsUrl: string | null
}

function parseVersion(tagName: string): string {
  return tagName.replace(/^(nordly|hone)-v/i, '').trim() || tagName
}

function pickInstallerAssets(assets: GitHubAsset[]): {
  macAarch64Url: string | null
  macX64Url: string | null
  windowsUrl: string | null
} {
  const installers = assets.filter((a) => !/\.(sig|tar\.gz)$/i.test(a.name))
  const macAarch64 =
    installers.find((a) => /_aarch64\.dmg$/i.test(a.name))?.browser_download_url ?? null
  const macX64 = installers.find((a) => /_x64\.dmg$/i.test(a.name))?.browser_download_url ?? null
  const windows =
    installers.find((a) => /-setup\.exe$/i.test(a.name))?.browser_download_url ??
    installers.find((a) => /\.msi$/i.test(a.name))?.browser_download_url ??
    null
  return { macAarch64Url: macAarch64, macX64Url: macX64, windowsUrl: windows }
}

function toReleaseInfo(release: GitHubRelease): NordlyReleaseInfo | null {
  const tag = release.tag_name?.toLowerCase() ?? ''
  if (!tag.startsWith('nordly-v') && !tag.startsWith('hone-v')) return null
  const picks = pickInstallerAssets(release.assets ?? [])
  return {
    version: parseVersion(release.tag_name),
    tagName: release.tag_name,
    releasePageUrl: release.html_url || NORDLY_RELEASES_PAGE,
    ...picks,
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
    const res = await fetch(GITHUB_LATEST_API, {
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!res.ok) return null
    const release = (await res.json()) as GitHubRelease
    const info = toReleaseInfo(release)
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
