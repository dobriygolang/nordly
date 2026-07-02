import { API_BASE, ApiError, parseResponse } from '@/lib/apiClient'

export interface PublishedNote {
  title: string
  bodyMd: string
  publishedAt: string | null
}

function requireStr(j: Record<string, unknown>, key: string): string {
  const v = j[key]
  if (typeof v !== 'string') {
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
    bodyMd: requireStr(j, 'bodyMd'),
    publishedAt: typeof publishedAtRaw === 'string' && publishedAtRaw ? publishedAtRaw : null,
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

export function publishedNoteDisplayTitle(title: string): string {
  const t = title.trim()
  return t || 'Untitled note'
}

export { ApiError }
