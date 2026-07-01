import { siteOrigin } from '@/lib/site/brand'

/** Guest share link — room UUID in path is enough for shared rooms (no invite token). */
export function publicLiveRoomUrl(roomId: string): string {
  const id = roomId.trim()
  if (!id) return `${siteOrigin()}/live/new`
  return `${siteOrigin()}/live/${id}`
}
