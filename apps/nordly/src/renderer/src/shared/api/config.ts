// API config — project backend (same host as web in prod).
//
// Prod: https://trynordly.app/v1/* (Caddy routes to microservices).
// Dev: empty base → same-origin Vite proxy (see vite.config.ts), or
// VITE_NORDLY_API_BASE for direct localhost gateway.

/** Empty in dev → same-origin + Vite proxy. */
const DEV_API_DEFAULT = '';
const PROD_API = 'https://trynordly.app';

const envBase = (import.meta.env.VITE_NORDLY_API_BASE as string | undefined)?.trim();

export const API_BASE_URL =
  envBase && envBase.length > 0
    ? envBase.replace(/\/$/, '')
    : import.meta.env.DEV
      ? DEV_API_DEFAULT
      : PROD_API;

/** Liveness probe — identity `/healthz` (Caddy in prod, Vite proxy in dev). */
export const HEALTH_CHECK_URL = `${API_BASE_URL}/healthz`;

/** Public web companion base URL — required for live/share links (no silent prod default). */
export function requireNordlyWebBaseUrl(): string {
  const raw = (import.meta.env.VITE_NORDLY_WEB_BASE as string | undefined)?.trim();
  if (!raw) {
    throw new Error('VITE_NORDLY_WEB_BASE is required for share links');
  }
  return raw.replace(/\/$/, '');
}
