import type { CodeRun } from '@/lib/types'

export function asArray<T>(value: T[] | undefined | null): T[] {
  if (value == null) return []
  return value
}

function requireNumber(value: unknown, label: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  throw new Error(`Invalid code run response: missing ${label}`)
}

export function normalizeCodeRun(raw: CodeRun): CodeRun {
  return {
    ...raw,
    tests_total: requireNumber(raw.tests_total, 'testsTotal'),
    tests_passed: requireNumber(raw.tests_passed, 'testsPassed'),
  }
}
