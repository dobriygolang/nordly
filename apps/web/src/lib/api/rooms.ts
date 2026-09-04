import { API_BASE, ApiError, apiWithBearer, parseGuestAuthResponse } from '@/lib/apiClient'
import {
  roomLanguageFromWire,
  roomLanguageToWire,
  roomTypeFromWire,
  roomTypeToWire,
} from '@/lib/api/wireEnums'

export const GuestRoomType = {
  Practice: 'practice',
  SystemDesign: 'system_design',
} as const
export type GuestRoomType = (typeof GuestRoomType)[keyof typeof GuestRoomType]

export type CodeRoom = {
  id: string
  owner_id: string
  room_type: GuestRoomType
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
const guestExpiryKey = (roomId: string) => `nordly_guest_expires_${roomId}`

export function readGuestToken(roomId: string): string | null {
  return sessionStorage.getItem(guestTokenKey(roomId))
}

export function persistGuestToken(roomId: string, token: string, expiresInSec?: number): void {
  sessionStorage.setItem(guestTokenKey(roomId), token)
  if (expiresInSec != null && Number.isFinite(expiresInSec) && expiresInSec > 0) {
    sessionStorage.setItem(guestExpiryKey(roomId), String(Date.now() + expiresInSec * 1000))
  }
}

export function guestSessionExpired(roomId: string): boolean {
  const raw = sessionStorage.getItem(guestExpiryKey(roomId))
  if (!raw) return false
  const at = Number(raw)
  return Number.isFinite(at) && Date.now() >= at
}

export function isGuestSessionFatalError(err: unknown): boolean {
  return err instanceof ApiError && [401, 403, 404, 410].includes(err.status)
}

export function readGuestRoom(roomId: string): CodeRoom | null {
  const raw = sessionStorage.getItem(guestRoomKey(roomId))
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Invalid guest room cache')
    }
    return mapCachedRoom(parsed as Record<string, unknown>)
  } catch (err) {
    console.warn('[rooms] invalid guest room cache', err)
    sessionStorage.removeItem(guestRoomKey(roomId))
    return null
  }
}

export function clearGuestSession(roomId: string): void {
  sessionStorage.removeItem(guestTokenKey(roomId))
  sessionStorage.removeItem(guestRoomKey(roomId))
  sessionStorage.removeItem(guestExpiryKey(roomId))
}

export function persistGuestRoom(roomId: string, room: CodeRoom): void {
  sessionStorage.setItem(guestRoomKey(roomId), JSON.stringify(room))
}

function bearerForRoom(roomId: string): string | null {
  return readGuestToken(roomId)
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
  throw new Error('Invalid room auth response: missing expiresIn')
}

function requireCachedRoomType(raw: unknown): GuestRoomType {
  if (raw === GuestRoomType.Practice || raw === GuestRoomType.SystemDesign) return raw
  throw new Error(`Invalid room response: bad roomType ${String(raw)}`)
}

function mapCachedRoom(r: Record<string, unknown>): CodeRoom {
  const expiresAt = r.expires_at
  const createdAt = r.created_at
  return {
    id: requireStringField(r, 'id', 'id'),
    owner_id: requireStringField(r, 'owner_id', 'ownerId'),
    room_type: requireCachedRoomType(r.room_type),
    language: requireStringField(r, 'language', 'language'),
    expires_at: typeof expiresAt === 'string' && expiresAt ? expiresAt : undefined,
    created_at: typeof createdAt === 'string' && createdAt ? createdAt : undefined,
  }
}

function mapWireRoom(r: Record<string, unknown>): CodeRoom {
  const expiresAt = r.expires_at
  const createdAt = r.created_at
  return {
    id: requireStringField(r, 'id', 'id'),
    owner_id: requireStringField(r, 'owner_id', 'ownerId'),
    room_type: roomTypeFromWire(r.room_type),
    language: roomLanguageFromWire(r.language),
    expires_at: typeof expiresAt === 'string' && expiresAt ? expiresAt : undefined,
    created_at: typeof createdAt === 'string' && createdAt ? createdAt : undefined,
  }
}

/** Expects grpc-gateway JSON already normalized to snake_case (see normalizeProtoJson). */
function mapRoom(raw: Record<string, unknown>): CodeRoom {
  const room = raw.room
  if (!room || typeof room !== 'object') {
    throw new Error('Invalid room response: missing room')
  }
  return mapWireRoom(room as Record<string, unknown>)
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
  language: string
  roomType: GuestRoomType
}): Promise<GuestCreateResult> {
  if (input.roomType !== GuestRoomType.Practice && input.roomType !== GuestRoomType.SystemDesign) {
    throw new Error('Invalid guest room type')
  }
  const language = input.language.trim()
  if (!language) {
    throw new Error('Invalid guest room language')
  }
  const displayName = input.displayName.trim()
  if (!displayName) {
    throw new Error('display name is required')
  }
  const res = await fetch(`${API_BASE}/rooms/guest-create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      displayName,
      language: roomLanguageToWire(language),
      roomType: roomTypeToWire(input.roomType),
    }),
  })
  const { accessToken, body } = await parseGuestAuthResponse('/rooms/guest-create', res)
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
  const name = displayName.trim()
  if (!name) {
    throw new Error('display name is required')
  }
  const res = await fetch(`${API_BASE}/rooms/${encodeURIComponent(id)}/guest-join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: name }),
    redirect: 'manual',
  })
  const { accessToken, body } = await parseGuestAuthResponse(
    `/rooms/${encodeURIComponent(id)}/guest-join`,
    res,
  )
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
