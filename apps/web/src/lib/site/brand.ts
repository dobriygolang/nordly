/** Public product name on trynordly.app (web). Desktop release tags use nordly-v*. */
export const SITE_NAME = 'Nordly'

export const SITE_DOMAIN = 'trynordly.app'

const DEFAULT_ORIGIN = `https://${SITE_DOMAIN}`

export function siteOrigin(): string {
  const fromEnv = import.meta.env.VITE_SITE_ORIGIN?.trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  if (typeof window !== 'undefined') return window.location.origin
  return DEFAULT_ORIGIN
}

export function formatPageTitle(pageTitle?: string): string {
  const trimmed = pageTitle?.trim()
  if (!trimmed) return `${SITE_NAME} — calm workspace for builders`
  return `${trimmed} · ${SITE_NAME}`
}
