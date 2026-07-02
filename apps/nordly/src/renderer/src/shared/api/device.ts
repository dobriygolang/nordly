import { STORAGE_KEYS } from '@shared/lib/storage-keys';

const DEVICE_ID_KEY: string = STORAGE_KEYS.deviceId;

let cached: string | null = null;

export function getDeviceId(): string | null {
  if (cached) return cached;
  cached = window.localStorage.getItem(DEVICE_ID_KEY);
  return cached;
}

export function setDeviceId(id: string): void {
  cached = id;
  window.localStorage.setItem(DEVICE_ID_KEY, id);
}

export function clearDeviceId(): void {
  cached = null;
  window.localStorage.removeItem(DEVICE_ID_KEY);
}

/** Assign a stable local device id for API headers (x-device-id). */
export async function ensureDevice(_opts: { appVersion: string; name?: string }): Promise<string> {
  const existing = getDeviceId();
  if (existing) return existing;
  const id = crypto.randomUUID();
  setDeviceId(id);
  return id;
}
