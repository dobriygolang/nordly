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
  const publishedAtRaw = j.published_at
  if (publishedAtRaw != null && typeof publishedAtRaw !== 'string') {
    throw new Error('Invalid published note: published_at must be a string')
  }
  const passwordRequired = requireBool(j, 'password_required')
  let bodyMd: string
  if (passwordRequired) {
    // Proto3 may omit empty body_md; any non-empty body before unlock is invalid.
    if (j.body_md !== undefined && j.body_md !== null && j.body_md !== '') {
      throw new Error('Invalid published note: password-gated body must be empty')
    }
    bodyMd = ''
  } else {
    bodyMd = requireStr(j, 'body_md')
  }
  return {
    title: requireStr(j, 'title'),
    bodyMd,
    publishedAt: typeof publishedAtRaw === 'string' && publishedAtRaw ? publishedAtRaw : null,
    passwordRequired,
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
    bodyMd: requireStr(body, 'body_md'),
    publishedAt:
      typeof body.published_at === 'string' && body.published_at ? body.published_at : null,
    passwordRequired: false,
  }
}

export function publishedNoteDisplayTitle(title: string): string {
  const t = title.trim()
  if (t) return t
  console.error('[publicNotes] published note missing title')
  return 'Untitled note'
}

export { ApiError }
