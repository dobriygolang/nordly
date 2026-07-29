/** Parse VITE_* boolean: "true"|"1" → true, "false"|"0" → false, else undefined. */
function readBoolEnv(raw: string | undefined): boolean | undefined {
  const v = raw?.trim().toLowerCase();
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  return undefined;
}

/**
 * Local-only data mode — notes/tasks/focus persist on device, no cloud sync.
 * Boot uses a tokenless local profile (no Telegram / identity). Set
 * VITE_NORDLY_LOCAL_ONLY=false for cloud APIs / deferred sign-in prompts.
 */
export const LOCAL_ONLY =
  readBoolEnv(import.meta.env.VITE_NORDLY_LOCAL_ONLY) ??
  true;

/** Cloud sync + Nordly identity integrations (notes/tasks sync, publish). */
export function isCloudEnabled(): boolean {
  return !LOCAL_ONLY;
}

/** Public Google OAuth client id baked at build time — device-owned calendar. */
export function isGoogleIntegrationAvailable(): boolean {
  return Boolean(String(import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '').trim());
}

/** Public Zoom OAuth client id baked at build time — device-owned meetings. */
export function isZoomIntegrationAvailable(): boolean {
  return Boolean(String(import.meta.env.VITE_ZOOM_CLIENT_ID ?? '').trim());
}
