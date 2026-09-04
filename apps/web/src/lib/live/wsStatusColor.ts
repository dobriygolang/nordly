export function wsStatusColor(status: string): string {
  if (status === 'open') return 'rgb(var(--ink))'
  if (status === 'failed') return 'var(--red)'
  return 'var(--ink-60)'
}
