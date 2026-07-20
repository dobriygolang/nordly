import { normalizeProtoJson } from '@/lib/protoJson'
import { readStoredLocale } from '@/lib/i18n/localeStorage'

export const API_BASE: string = import.meta.env.VITE_API_BASE ?? '/v1'

export const ACCESS_TOKEN_KEY = 'nordly_access_token'
const REFRESH_TOKEN_KEY = 'nordly_refresh_token'

function safeDelete(key: string): void {
  try {
    if (typeof window !== 'undefined') window.localStorage.removeItem(key)
  } catch {
    /* noop */
  }
}

/** Clears legacy identity tokens left from retired web login. */
export function clearTokens(): void {
  safeDelete(ACCESS_TOKEN_KEY)
  safeDelete(REFRESH_TOKEN_KEY)
}

/** Guest room responses include accessToken only (no refresh). */
export function parseGuestAccessToken(body: Record<string, unknown>): string {
  const access = body.accessToken
  if (typeof access !== 'string' || !access) {
    throw new Error('missing accessToken in guest auth response')
  }
  return access
}

async function doFetch(path: string, init: RequestInit, bearer: string | null): Promise<Response> {
  const headers = new Headers(init.headers ?? undefined)
  if (!headers.has('content-type') && init.body) {
    headers.set('content-type', 'application/json')
  }
  if (bearer) headers.set('authorization', `Bearer ${bearer}`)
  if (!headers.has('accept-language')) {
    headers.set('accept-language', readStoredLocale())
  }
  return fetch(`${API_BASE}${path}`, { ...init, headers })
}

export async function parseResponse<T>(path: string, res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new ApiError(res.status, body)
  }
  if (res.status === 204) return undefined as T
  const text = await res.text()
  if (!text) return undefined as T
  if (text.trimStart().startsWith('<')) {
    throw new ApiError(
      res.status,
      `API returned HTML instead of JSON for ${path} — check /v1 routing on reverse proxy`,
    )
  }
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    throw new ApiError(res.status, text.slice(0, 500))
  }
  return normalizeProtoJson(body) as T
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`api ${status}: ${body}`)
  }
}

/** Human-readable message from ApiError JSON body or HTML misroute. */
export function formatApiError(err: unknown): string {
  if (err instanceof ApiError) {
    const trimmed = err.body.trim()
    if (trimmed.startsWith('<')) {
      return 'API вернул HTML вместо JSON — проверь роутинг /v1 на прокси (Caddy).'
    }
    try {
      const parsed = JSON.parse(trimmed) as { message?: string }
      if (typeof parsed.message === 'string' && parsed.message) return parsed.message
    } catch {
      /* plain text body */
    }
    if (trimmed) return trimmed
    return err.message
  }
  if (err instanceof Error) return err.message
  return 'Неизвестная ошибка'
}

/** API call with explicit bearer (e.g. guest scoped JWT). */
export async function apiWithBearer<T = unknown>(
  path: string,
  init: RequestInit,
  bearer: string,
): Promise<T> {
  const res = await doFetch(path, init, bearer)
  return parseResponse<T>(path, res)
}
