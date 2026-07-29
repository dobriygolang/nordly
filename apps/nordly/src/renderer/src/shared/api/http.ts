import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

import { handleUnauthorized, refreshAccessToken } from '@shared/api/authSession';
import { isNativeHttpInTauri } from '@platform/runtime';
import { useSessionStore } from '@shared/model/session';

type ApiFetchOptions = {
  /** Internal — prevents infinite retry on persistent 401. */
  _retried?: boolean;
};

function requestHadAuth(init?: RequestInit): boolean {
  if (!init?.headers) return false;
  const headers = new Headers(init.headers);
  return headers.has('authorization') || headers.has('Authorization');
}

function withFreshBearer(init?: RequestInit): RequestInit | undefined {
  if (!init) return init;
  const token = useSessionStore.getState().accessToken;
  if (!token) return init;
  const headers = new Headers(init.headers);
  if (headers.has('authorization') || headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return { ...init, headers };
}

async function coreFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return isNativeHttpInTauri() ? tauriFetch(input, init) : fetch(input, init);
}

export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: ApiFetchOptions,
): Promise<Response> {
  const resp = await coreFetch(input, init);

  if (resp.status === 401 && !options?._retried) {
    const hadAuth = requestHadAuth(init);
    if (hadAuth) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        return apiFetch(input, withFreshBearer(init), { _retried: true });
      }
    }
    await handleUnauthorized();
  }

  return resp;
}
