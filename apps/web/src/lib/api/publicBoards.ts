import { API_BASE, ApiError, parseResponse } from '@/lib/apiClient'

export interface PublishedBoard {
  title: string
  sceneJson: string
}

function proto3String(obj: Record<string, unknown>, key: string, label: string): string {
  const v = obj[key]
  if (v === undefined || v === null) return ''
  if (typeof v !== 'string') {
    throw new Error(`Invalid published board response: missing ${label}`)
  }
  return v
}

function mapPublishedBoard(j: Record<string, unknown>): PublishedBoard {
  const title = proto3String(j, 'title', 'title')
  const sceneJson = proto3String(j, 'scene_json', 'sceneJson')
  return { title, sceneJson }
}

export async function fetchPublishedBoard(slug: string): Promise<PublishedBoard> {
  const path = `/rooms/boards/public/${encodeURIComponent(slug)}`
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { accept: 'application/json' },
  })
  const body = await parseResponse<Record<string, unknown>>(path, res)
  return mapPublishedBoard(body)
}

export function publishedBoardDisplayTitle(title: string): string {
  return title.trim()
}

export { ApiError }
