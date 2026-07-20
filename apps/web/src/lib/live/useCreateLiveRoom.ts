import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { createGuestRoom, persistGuestToken, type GuestRoomType } from '@/lib/api/rooms'
import { persistGuestDisplayName, readGuestDisplayName } from '@/lib/live/guestDisplayName'
import { publicLiveRoomUrl } from '@/lib/live/liveRoomUrl'

export function useCreateLiveRoom() {
  const navigate = useNavigate()

  return useMutation({
    mutationFn: async (input: {
      language: string
      displayName: string
      roomType: GuestRoomType
    }) => {
      const name = input.displayName.trim() || readGuestDisplayName().trim()
      if (!name) {
        throw new Error('display name is required')
      }
      persistGuestDisplayName(name)
      const result = await createGuestRoom({
        displayName: name,
        language: input.language,
        roomType: input.roomType,
      })
      return {
        room: result.room,
        access_token: result.access_token,
      }
    },
    onSuccess: async ({ room, access_token }) => {
      persistGuestToken(room.id, access_token)
      try {
        await navigator.clipboard.writeText(publicLiveRoomUrl(room.id))
      } catch {
        /* clipboard blocked */
      }
      navigate(`/live/${room.id}`)
    },
  })
}
