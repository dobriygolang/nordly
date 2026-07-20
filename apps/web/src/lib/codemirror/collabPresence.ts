import type { Awareness } from 'y-protocols/awareness'

export type CollabPeer = {
  clientId: number
  userId: string
  name: string
  color: string
  isSelf: boolean
  /** Tab visible and window focused. */
  active: boolean
}

type AwarenessUser = {
  name?: string
  color?: string
  colorLight?: string
  userId?: string
  active?: boolean
}

export function peersFromAwareness(awareness: Awareness): CollabPeer[] {
  const selfId = awareness.clientID
  const peers: CollabPeer[] = []
  awareness.getStates().forEach((state, clientId) => {
    const user = state.user as AwarenessUser | undefined
    if (!user?.name) return
    peers.push({
      clientId,
      userId: requirePeerString(user.userId, 'userId'),
      name: user.name,
      color: requirePeerString(user.color, 'color'),
      isSelf: clientId === selfId,
      active: user.active === true,
    })
  })
  peers.sort((a, b) => {
    if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  return peers
}

function requirePeerString(value: string | undefined, field: string): string {
  if (typeof value !== 'string' || !value) {
    throw new Error(`Invalid collab peer: missing ${field}`)
  }
  return value
}
