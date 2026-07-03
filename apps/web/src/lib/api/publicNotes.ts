import { API_BASE, ApiError, parseResponse } from '@/lib/apiClient'

export interface PublishedNote {
  title: string
  bodyMd: string
  publishedAt: string | null
  passwordRequired: boolean
}

function requireStr(j: Record<string, unknown>, key: string): string {
  const v = j[key]
  if (typeof v !== 'string') {
    throw new Error(`Invalid published note: missing ${key}`)
  }
  return v
}

function requireBool(j: Record<string, unknown>, key: string): boolean {
  const v = j[key]
  if (typeof v !== 'boolean') {
    throw new Error(`Invalid published note: missing ${key}`)
  }
  return v
}

function mapPublishedNote(j: Record<string, unknown>): PublishedNote {
  const publishedAtRaw = j.publishedAt
  if (publishedAtRaw != null && typeof publishedAtRaw !== 'string') {
    throw new Error('Invalid published note: publishedAt must be a string')
  }
  return {
    title: requireStr(j, 'title'),
    bodyMd: typeof j.bodyMd === 'string' ? j.bodyMd : '',
    publishedAt: typeof publishedAtRaw === 'string' && publishedAtRaw ? publishedAtRaw : null,
    passwordRequired: requireBool(j, 'passwordRequired'),
  }
}

export async function fetchPublishedNote(slug: string): Promise<PublishedNote> {
  const path = `/notes/public/${encodeURIComponent(slug)}`
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { accept: 'application/json' },
  })
  const body = await parseResponse<Record<string, unknown>>(path, res)
  return mapPublishedNote(body)
}

export async function accessPublishedNote(slug: string, password: string): Promise<PublishedNote> {
  const path = `/notes/public/${encodeURIComponent(slug)}/access`
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  const body = await parseResponse<Record<string, unknown>>(path, res)
  return {
    title: requireStr(body, 'title'),
    bodyMd: requireStr(body, 'bodyMd'),
    publishedAt:
      typeof body.publishedAt === 'string' && body.publishedAt ? body.publishedAt : null,
    passwordRequired: false,
  }
}

export function publishedNoteDisplayTitle(title: string): string {
  const t = title.trim()
  return t || 'Untitled note'
}

export { ApiError }
