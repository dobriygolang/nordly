import { apiWithBearer } from '@/lib/apiClient'
import { normalizeCodeRun } from '@/lib/api/normalize'
import { sandboxLanguageToWire } from '@/lib/api/wireEnums'
import type { CodeRun } from '@/lib/types'

function requireBearer(accessToken?: string | null): string {
  const bearer = accessToken?.trim()
  if (!bearer) {
    throw new Error('sandbox requires guest access token')
  }
  return bearer
}

function requireRoomId(roomId?: string | null): string {
  const id = roomId?.trim()
  if (!id) {
    throw new Error('sandbox requires roomId for editor access')
  }
  return id
}

function sandboxRequest<T>(
  path: string,
  init: RequestInit,
  accessToken?: string | null,
): Promise<T> {
  return apiWithBearer<T>(path, init, requireBearer(accessToken))
}

export function runCode(
  input: {
    language: string
    code: string
    stdin?: string
    roomId: string
  },
  accessToken?: string | null,
) {
  const roomId = requireRoomId(input.roomId)
  return sandboxRequest<{ run: CodeRun }>(
    '/sandbox/code-runs',
    {
      method: 'POST',
      body: JSON.stringify({
        language: sandboxLanguageToWire(input.language),
        code: input.code,
        stdin: input.stdin,
        roomId,
      }),
    },
    accessToken,
  ).then((res) => ({ run: normalizeCodeRun(res.run) }))
}

export function getCodeRun(id: string, accessToken: string | null | undefined, roomId: string) {
  const room = requireRoomId(roomId)
  return sandboxRequest<{ run: CodeRun }>(
    `/sandbox/code-runs/${encodeURIComponent(id)}?roomId=${encodeURIComponent(room)}`,
    {},
    accessToken,
  ).then((res) => ({
    run: normalizeCodeRun(res.run),
  }))
}

export function formatCode(
  input: { language: string; code: string; roomId: string },
  accessToken?: string | null,
) {
  const roomId = requireRoomId(input.roomId)
  return sandboxRequest<{ code: string }>(
    '/sandbox/format',
    {
      method: 'POST',
      body: JSON.stringify({
        language: sandboxLanguageToWire(input.language),
        code: input.code,
        roomId,
      }),
    },
    accessToken,
  )
}

export function isTerminalRunStatus(status: string): boolean {
  return status !== 'queued' && status !== 'running'
}
