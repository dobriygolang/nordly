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

/** Fallback when /v1/auth/config is unavailable. */
export const TELEGRAM_BOT_USERNAME =
  (import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined)?.trim() || 'nordly_bot';

export const DEV_BEARER_TOKEN: string | null =
  ((import.meta.env.VITE_NORDLY_DEV_TOKEN as string | undefined) ?? '').trim() || null;
