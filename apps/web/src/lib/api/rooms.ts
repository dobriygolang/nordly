import { API_BASE, apiWithBearer, parseGuestAccessToken, readAccessToken } from '@/lib/apiClient'
import { normalizeProtoJson } from '@/lib/protoJson'

export type CodeRoom = {
  id: string
  owner_id: string
  room_type: string
  language: string
  expires_at?: string
  created_at?: string
}

export type InviteLink = {
  url: string
}

export type GuestJoinResult = {
  access_token: string
  expires_in: number
  room: CodeRoom
}

export type GuestCreateResult = GuestJoinResult & {
  invite: InviteLink
}

const guestTokenKey = (roomId: string) => `nordly_guest_token_${roomId}`
const guestRoomKey = (roomId: string) => `nordly_guest_room_${roomId}`

export function readGuestToken(roomId: string): string | null {
  try {
    return sessionStorage.getItem(guestTokenKey(roomId))
  } catch {
    return null
  }
}

export function persistGuestToken(roomId: string, token: string): void {
  try {
    sessionStorage.setItem(guestTokenKey(roomId), token)
  } catch {
    /* sessionStorage unavailable — non-critical */
  }
}

export function readGuestRoom(roomId: string): CodeRoom | null {
  try {
    const raw = sessionStorage.getItem(guestRoomKey(roomId))
    if (!raw) return null
    return JSON.parse(raw) as CodeRoom
  } catch {
    return null
  }
}

export function persistGuestRoom(roomId: string, room: CodeRoom): void {
  try {
    sessionStorage.setItem(guestRoomKey(roomId), JSON.stringify(room))
  } catch {
    /* sessionStorage unavailable — non-critical */
  }
}

function bearerForRoom(roomId: string): string | null {
  return readGuestToken(roomId) ?? readAccessToken()
}

function requireStringField(obj: Record<string, unknown>, key: string, label: string): string {
  const v = obj[key]
  if (typeof v !== 'string' || !v) {
    throw new Error(`Invalid room response: missing ${label}`)
  }
  return v
}

function requireExpiresIn(body: Record<string, unknown>): number {
  const v = body.expires_in
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  throw new Error('Invalid room auth response: missing expiresIn')
}

/** Expects grpc-gateway JSON already normalized to snake_case (see normalizeProtoJson). */
function mapRoom(raw: Record<string, unknown>): CodeRoom {
  const room = raw.room
  if (!room || typeof room !== 'object') {
    throw new Error('Invalid room response: missing room')
  }
  const r = room as Record<string, unknown>
  const expiresAt = r.expires_at
  const createdAt = r.created_at
  return {
    id: requireStringField(r, 'id', 'id'),
    owner_id: requireStringField(r, 'owner_id', 'ownerId'),
    room_type: requireStringField(r, 'room_type', 'roomType'),
    language: requireStringField(r, 'language', 'language'),
    expires_at: typeof expiresAt === 'string' && expiresAt ? expiresAt : undefined,
    created_at: typeof createdAt === 'string' && createdAt ? createdAt : undefined,
  }
}

function mapInvite(body: Record<string, unknown>): InviteLink {
  const inviteRaw = body.invite
  if (!inviteRaw || typeof inviteRaw !== 'object') {
    throw new Error('Invalid guest create response: missing invite')
  }
  const invite = inviteRaw as Record<string, unknown>
  return { url: requireStringField(invite, 'url', 'invite.url') }
}

export async function createGuestRoom(input: {
  displayName: string
  language?: string
  roomType?: string
}): Promise<GuestCreateResult> {
  const res = await fetch(`${API_BASE}/rooms/guest-create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      displayName: input.displayName.trim() || 'guest',
      language: input.language ?? 'go',
      roomType: input.roomType ?? 'practice',
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `guest create ${res.status}`)
  }
  const raw = (await res.json()) as Record<string, unknown>
  const accessToken = parseGuestAccessToken(raw)
  const body = normalizeProtoJson(raw) as Record<string, unknown>
  return {
    access_token: accessToken,
    expires_in: requireExpiresIn(body),
    room: mapRoom(body),
    invite: mapInvite(body),
  }
}

export async function getRoom(roomId: string): Promise<CodeRoom> {
  const token = bearerForRoom(roomId)
  if (!token) throw new Error('not authenticated')
  const res = await apiWithBearer<{ room: CodeRoom }>(
    `/rooms/${encodeURIComponent(roomId)}`,
    { method: 'GET' },
    token,
  )
  return mapRoom({ room: res.room } as Record<string, unknown>)
}

export async function guestJoin(
  roomId: string,
  displayName: string,
): Promise<GuestJoinResult> {
  const id = roomId.trim()
  if (!id) {
    throw new Error('missing room id')
  }
  const res = await fetch(`${API_BASE}/rooms/${encodeURIComponent(id)}/guest-join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: displayName.trim() || 'guest' }),
    redirect: 'manual',
  })
  if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) {
    throw new Error('guest join misrouted — check room URL')
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `guest join ${res.status}`)
  }
  const raw = (await res.json()) as Record<string, unknown>
  const accessToken = parseGuestAccessToken(raw)
  const body = normalizeProtoJson(raw) as Record<string, unknown>
  const room = mapRoom(body)
  persistGuestRoom(id, room)
  return {
    access_token: accessToken,
    expires_in: requireExpiresIn(body),
    room,
  }
}

export async function closeRoom(roomId: string): Promise<void> {
  const token = bearerForRoom(roomId)
  if (!token) throw new Error('not authenticated')
  await apiWithBearer(`/rooms/${encodeURIComponent(roomId)}/close`, { method: 'POST', body: '{}' }, token)
}

export async function fetchInitialScene(roomId: string): Promise<string> {
  const token = bearerForRoom(roomId)
  if (!token) throw new Error('not authenticated')
  const res = await apiWithBearer<{ scene_json?: string }>(
    `/rooms/${encodeURIComponent(roomId)}/initial-scene`,
    { method: 'GET' },
    token,
  )
  const scene = res.scene_json
  if (typeof scene !== 'string') {
    throw new Error('Invalid initial scene response: missing sceneJson')
  }
  return scene
}
