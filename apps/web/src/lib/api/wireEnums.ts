import type { CodeRunStatus } from '@/lib/types'

export type WireGuestRoomType = 'practice' | 'system_design'

const ROOM_TYPE_TO_WIRE: Record<WireGuestRoomType, string> = {
  practice: 'ROOM_TYPE_PRACTICE',
  system_design: 'ROOM_TYPE_SYSTEM_DESIGN',
}

const ROOM_TYPE_FROM_WIRE: Record<string, WireGuestRoomType> = {
  ROOM_TYPE_PRACTICE: 'practice',
  ROOM_TYPE_SYSTEM_DESIGN: 'system_design',
}

const ROOM_LANGUAGE_TO_WIRE: Record<string, string> = {
  go: 'ROOM_LANGUAGE_GO',
  python: 'ROOM_LANGUAGE_PYTHON',
  javascript: 'ROOM_LANGUAGE_JAVASCRIPT',
  typescript: 'ROOM_LANGUAGE_TYPESCRIPT',
  diagram: 'ROOM_LANGUAGE_DIAGRAM',
}

const ROOM_LANGUAGE_FROM_WIRE: Record<string, string> = {
  ROOM_LANGUAGE_GO: 'go',
  ROOM_LANGUAGE_PYTHON: 'python',
  ROOM_LANGUAGE_JAVASCRIPT: 'javascript',
  ROOM_LANGUAGE_TYPESCRIPT: 'typescript',
  ROOM_LANGUAGE_DIAGRAM: 'diagram',
}

const SANDBOX_LANGUAGE_TO_WIRE: Record<string, string> = {
  go: 'LANGUAGE_GO',
  python: 'LANGUAGE_PYTHON',
  javascript: 'LANGUAGE_JAVASCRIPT',
}

const SANDBOX_LANGUAGE_FROM_WIRE: Record<string, string> = {
  LANGUAGE_GO: 'go',
  LANGUAGE_PYTHON: 'python',
  LANGUAGE_JAVASCRIPT: 'javascript',
}

const RUN_STATUS_TO_WIRE: Record<CodeRunStatus, string> = {
  queued: 'RUN_STATUS_QUEUED',
  running: 'RUN_STATUS_RUNNING',
  success: 'RUN_STATUS_SUCCESS',
  compile_error: 'RUN_STATUS_COMPILE_ERROR',
  runtime_error: 'RUN_STATUS_RUNTIME_ERROR',
  timeout: 'RUN_STATUS_TIMEOUT',
  internal_error: 'RUN_STATUS_INTERNAL_ERROR',
}

const RUN_STATUS_FROM_WIRE: Record<string, CodeRunStatus> = Object.fromEntries(
  Object.entries(RUN_STATUS_TO_WIRE).map(([local, wire]) => [wire, local as CodeRunStatus]),
)

export function roomTypeToWire(roomType: WireGuestRoomType): string {
  return ROOM_TYPE_TO_WIRE[roomType]
}

export function roomTypeFromWire(raw: unknown): WireGuestRoomType {
  if (typeof raw !== 'string') {
    throw new Error(`Invalid room response: bad roomType ${String(raw)}`)
  }
  const roomType = ROOM_TYPE_FROM_WIRE[raw]
  if (!roomType) throw new Error(`Invalid room response: bad roomType ${raw}`)
  return roomType
}

export function roomLanguageToWire(language: string): string {
  const wire = ROOM_LANGUAGE_TO_WIRE[language]
  if (!wire) throw new Error(`Invalid guest room language`)
  return wire
}

export function roomLanguageFromWire(raw: unknown): string {
  if (typeof raw !== 'string' || !raw) {
    throw new Error('Invalid room response: missing language')
  }
  const language = ROOM_LANGUAGE_FROM_WIRE[raw]
  if (!language) throw new Error(`Invalid room response: bad language ${raw}`)
  return language
}

export function sandboxLanguageToWire(language: string): string {
  const wire = SANDBOX_LANGUAGE_TO_WIRE[language]
  if (!wire) throw new Error(`unsupported sandbox language ${language}`)
  return wire
}

export function sandboxLanguageFromWire(raw: unknown): string {
  if (typeof raw !== 'string' || !raw) {
    throw new Error('Invalid code run response: missing language')
  }
  const language = SANDBOX_LANGUAGE_FROM_WIRE[raw]
  if (!language) throw new Error(`Invalid code run response: bad language ${raw}`)
  return language
}

export function runStatusFromWire(raw: unknown): CodeRunStatus {
  if (typeof raw !== 'string') {
    throw new Error(`Invalid code run response: bad status ${String(raw)}`)
  }
  const status = RUN_STATUS_FROM_WIRE[raw]
  if (!status) throw new Error(`Invalid code run response: bad status ${raw}`)
  return status
}
