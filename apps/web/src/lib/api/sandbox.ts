import { apiWithBearer } from '@/lib/apiClient'
import { normalizeCodeRun } from '@/lib/api/normalize'
import type { CodeRun } from '@/lib/types'

function requireBearer(accessToken?: string | null): string {
  const bearer = accessToken?.trim()
  if (!bearer) {
    throw new Error('sandbox requires guest access token')
  }
  return bearer
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
  },
  accessToken?: string | null,
) {
  return sandboxRequest<{ run: CodeRun }>(
    '/sandbox/code-runs',
    {
      method: 'POST',
      body: JSON.stringify({
        language: input.language,
        code: input.code,
        stdin: input.stdin,
      }),
    },
    accessToken,
  ).then((res) => ({ run: normalizeCodeRun(res.run) }))
}

export function getCodeRun(id: string, accessToken?: string | null) {
  return sandboxRequest<{ run: CodeRun }>(
    `/sandbox/code-runs/${id}`,
    {},
    accessToken,
  ).then((res) => ({
    run: normalizeCodeRun(res.run),
  }))
}

export function formatCode(
  input: { language: string; code: string },
  accessToken?: string | null,
) {
  return sandboxRequest<{ code: string }>(
    '/sandbox/format',
    {
      method: 'POST',
      body: JSON.stringify({
        language: input.language,
        code: input.code,
      }),
    },
    accessToken,
  )
}

export function isTerminalRunStatus(status: string): boolean {
  return !['queued', 'running'].includes(status)
}
