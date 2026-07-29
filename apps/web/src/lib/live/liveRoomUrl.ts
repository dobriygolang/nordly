import { liveOrigin, isLiveCodeHost, LIVE_CODE_DOMAIN } from '@/lib/site/brand'

const ROOM_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** True when path segment is a room UUID (short share links on code host). */
export function isLiveRoomId(value: string | undefined): boolean {
  return Boolean(value && ROOM_ID_RE.test(value.trim()))
}

/** In-app path to create a room (works on any host). */
export function liveNewPath(): string {
  return isLiveCodeHost() ? '/' : '/live/new'
}

/** In-app path to an existing room. */
export function liveRoomPath(roomId: string): string {
  const id = roomId.trim()
  if (!id) return liveNewPath()
  return isLiveCodeHost() ? `/${id}` : `/live/${id}`
}

/** Guest share link — short `{liveOrigin}/{roomId}` (UUID is the capability). */
export function publicLiveRoomUrl(roomId: string): string {
  const id = roomId.trim()
  if (!id) return publicLiveNewUrl()
  return `${liveOrigin()}/${id}`
}

/** Absolute URL for the live create page (landing CTAs → code.trynordly.app). */
export function publicLiveNewUrl(): string {
  if (import.meta.env.DEV && typeof window !== 'undefined' && !isLiveCodeHost()) {
    return `${window.location.origin}/live/new`
  }
  if (isLiveCodeHost()) {
    return `${liveOrigin()}/`
  }
  return `https://${LIVE_CODE_DOMAIN}/`
}
