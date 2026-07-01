import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

function isTauriShell(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** Native HTTP in packaged Tauri; browser fetch in dev (Vite proxy). */
function shouldUseNativeHttp(): boolean {
  return isTauriShell() && !import.meta.env.DEV;
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (shouldUseNativeHttp()) {
    return tauriFetch(input, init);
  }
  return fetch(input, init);
}
