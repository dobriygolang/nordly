export const LIVE_LANGS = [
  { id: 'go', label: 'Go' },
  { id: 'python', label: 'Python' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
] as const

import { GuestRoomType } from '@/lib/api/rooms'

export const LIVE_ROOM_MODES = [
  { id: 'code', roomType: GuestRoomType.Practice, language: 'go' },
  { id: 'diagram', roomType: GuestRoomType.SystemDesign, language: 'diagram' },
] as const

export type LiveLanguageId = (typeof LIVE_LANGS)[number]['id']
export type LiveRoomModeId = (typeof LIVE_ROOM_MODES)[number]['id']
