export function canReachNetwork(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine;
}
