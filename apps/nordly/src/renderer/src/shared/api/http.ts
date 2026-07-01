import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

import { handleUnauthorized } from '@shared/api/authSession';

function isTauriShell(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** Native HTTP in packaged Tauri; browser fetch in dev (Vite proxy). */
function shouldUseNativeHttp(): boolean {
  return isTauriShell() && !import.meta.env.DEV;
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const resp = shouldUseNativeHttp()
    ? await tauriFetch(input, init)
    : await fetch(input, init);

  if (resp.status === 401) {
    void handleUnauthorized();
  }

  return resp;
}
