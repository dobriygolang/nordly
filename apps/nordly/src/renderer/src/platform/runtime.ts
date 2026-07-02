/** True when the renderer runs inside a Tauri WebView (dev or packaged). */
export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** Packaged Tauri builds use native HTTP; dev uses browser fetch + Vite proxy. */
export function isNativeHttpInTauri(): boolean {
  return isTauriRuntime() && !import.meta.env.DEV;
}
