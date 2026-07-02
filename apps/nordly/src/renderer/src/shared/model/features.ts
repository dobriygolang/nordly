/** Parse VITE_* boolean: "true"|"1" → true, "false"|"0" → false, else undefined. */
function readBoolEnv(raw: string | undefined): boolean | undefined {
  const v = raw?.trim().toLowerCase();
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  return undefined;
}

/**
 * Local-only data mode — notes/tasks/focus persist on device, no cloud sync.
 * Auth (login) is unchanged. Set VITE_NORDLY_LOCAL_ONLY=false for cloud APIs.
 */
export const LOCAL_ONLY =
  readBoolEnv(import.meta.env.VITE_NORDLY_LOCAL_ONLY) ??
  true;

/** Cloud sync + integrations (tracker, notes API, Google Calendar, vault server). */
export function isCloudEnabled(): boolean {
  return !LOCAL_ONLY;
}
