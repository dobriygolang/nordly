export type LiveRoomTheme = 'light' | 'dark'

const KEY = 'nordly_live_theme'

export function readLiveRoomTheme(): LiveRoomTheme {
  try {
    const v = sessionStorage.getItem(KEY)
    return v === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function persistLiveRoomTheme(theme: LiveRoomTheme): void {
  try {
    sessionStorage.setItem(KEY, theme)
  } catch {
    /* noop */
  }
}
