/** Public product name on trynordly.app (web). Desktop release tags use nordly-v*. */
export const SITE_NAME = 'Nordly'

export const SITE_DOMAIN = 'trynordly.app'

/** Dedicated live-collab host (share links + create room). */
export const LIVE_CODE_DOMAIN = 'code.trynordly.app'

const DEFAULT_ORIGIN = `https://${SITE_DOMAIN}`
const DEFAULT_LIVE_ORIGIN = `https://${LIVE_CODE_DOMAIN}`

export function siteOrigin(): string {
  const fromEnv = import.meta.env.VITE_SITE_ORIGIN?.trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  if (typeof window !== 'undefined') return window.location.origin
  return DEFAULT_ORIGIN
}

/** Canonical origin for live room share links (create + invite). */
export function liveOrigin(): string {
  const fromEnv = import.meta.env.VITE_LIVE_ORIGIN?.trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  if (typeof window !== 'undefined' && isLiveCodeHost(window.location.hostname)) {
    return window.location.origin
  }
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    return window.location.origin
  }
  return DEFAULT_LIVE_ORIGIN
}

export function isLiveCodeHost(hostname = typeof window !== 'undefined' ? window.location.hostname : ''): boolean {
  return hostname === LIVE_CODE_DOMAIN
}

export function formatPageTitle(pageTitle?: string): string {
  const trimmed = pageTitle?.trim()
  if (!trimmed) return `${SITE_NAME} — calm workspace for builders`
  return `${trimmed} · ${SITE_NAME}`
}
