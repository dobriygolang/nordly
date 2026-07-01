export type LiveRoomTheme = 'light' | 'dark'

/** Live rooms always open in dark mode; toggle is session-only (not persisted). */
export function readLiveRoomTheme(): LiveRoomTheme {
  return 'dark'
}

export function persistLiveRoomTheme(_theme: LiveRoomTheme): void {
  /* intentionally not persisted — default is always dark */
}
