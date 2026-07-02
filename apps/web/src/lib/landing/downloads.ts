import {
  detectMacArch,
  fetchLatestNordlyRelease,
  NORDLY_RELEASES_PAGE,
  type NordlyReleaseInfo,
} from '@/lib/landing/nordlyRelease'

const MAC_URL = import.meta.env.VITE_NORDLY_DOWNLOAD_MAC ?? ''
const WIN_URL = import.meta.env.VITE_NORDLY_DOWNLOAD_WIN ?? ''

export type DownloadPlatform = 'mac' | 'windows' | 'other'

export { NORDLY_RELEASES_PAGE }

export function detectPlatform(): DownloadPlatform {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent.toLowerCase()
  const platform = navigator.platform?.toLowerCase() ?? ''
  if (/mac|iphone|ipad|ipod/.test(platform) || /mac os/.test(ua)) return 'mac'
  if (/win/.test(platform) || /windows/.test(ua)) return 'windows'
  return 'other'
}

async function urlFromRelease(
  release: NordlyReleaseInfo,
  platform: DownloadPlatform,
): Promise<string | null> {
  if (platform === 'windows') return release.windowsUrl
  if (platform === 'mac') {
    const arch = await detectMacArch()
    if (arch === 'x64') return release.macX64Url ?? release.macAarch64Url
    return release.macAarch64Url ?? release.macX64Url
  }
  return release.macAarch64Url ?? release.windowsUrl ?? release.macX64Url
}

function urlFromEnv(platform: DownloadPlatform): string | null {
  if (platform === 'mac' && MAC_URL) return MAC_URL
  if (platform === 'windows' && WIN_URL) return WIN_URL
  return null
}

export function triggerDownload(url: string): void {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.rel = 'noopener noreferrer'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

export async function resolveDownloadUrl(platform: DownloadPlatform): Promise<string | null> {
  const envUrl = urlFromEnv(platform)
  if (envUrl) return envUrl

  const release = await fetchLatestNordlyRelease()
  if (!release) return null

  const direct = await urlFromRelease(release, platform)
  if (direct) return direct

  const anyInstaller = release.macAarch64Url ?? release.windowsUrl ?? release.macX64Url
  if (anyInstaller) return anyInstaller

  return release.releasePageUrl
}
