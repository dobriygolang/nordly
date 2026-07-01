import type { CodeRun } from '@/lib/types'

export function asArray<T>(value: T[] | undefined | null): T[] {
  return value ?? []
}

export function normalizeCodeRun(raw: CodeRun): CodeRun {
  return {
    ...raw,
    tests_total: raw.tests_total ?? 0,
    tests_passed: raw.tests_passed ?? 0,
    test_results: asArray(raw.test_results),
  }
}
