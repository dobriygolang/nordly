import { GuestRoomType, type CodeRoom } from '@/lib/api/rooms'

export function isDesignRoom(room: Pick<CodeRoom, 'room_type'>): boolean {
  return room.room_type === GuestRoomType.SystemDesign
}
