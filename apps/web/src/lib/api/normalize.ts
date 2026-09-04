import type { CodeRun } from '@/lib/types'
import { runStatusFromWire, sandboxLanguageFromWire } from '@/lib/api/wireEnums'

function requireString(value: unknown, label: string): string {
  if (typeof value === 'string' && value) return value
  throw new Error(`Invalid code run response: missing ${label}`)
}

export function normalizeCodeRun(raw: CodeRun): CodeRun {
  return {
    ...raw,
    id: requireString(raw.id, 'id'),
    language: sandboxLanguageFromWire(raw.language),
    status: runStatusFromWire(raw.status),
  }
}
