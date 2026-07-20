const KEY = 'nordly_guest_display_name'

export function readGuestDisplayName(): string {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch (err) {
    console.warn('[live] guest display name read failed', err)
    return ''
  }
}

export function persistGuestDisplayName(name: string): void {
  try {
    localStorage.setItem(KEY, name.trim())
  } catch (err) {
    console.warn('[live] guest display name persist failed', err)
  }
}
