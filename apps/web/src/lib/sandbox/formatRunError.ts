import { formatApiError } from '@/lib/apiClient'

export function formatSandboxRunError(err: unknown): string {
  return formatApiError(err)
}
