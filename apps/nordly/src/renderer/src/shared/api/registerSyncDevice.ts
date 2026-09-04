import { API_BASE_URL } from '@shared/api/config';
import { requireAccessToken } from '@shared/api/authToken';
import { apiFetch } from '@shared/api/http';
import { getDeviceId } from '@shared/api/device';
import { requireJsonBoolean, requireJsonNumber, requireJsonString } from '@shared/api/json';

export interface DeviceRegisterResult {
  deviceId: string;
  cloudSyncEnabled: boolean;
  deviceLimit: number;
  devicesRegistered: number;
}

/** Register this desktop for cloud sync identity. */
export async function registerSyncDevice(opts: {
  appVersion: string;
  name?: string;
}): Promise<DeviceRegisterResult> {
  const deviceId = getDeviceId();
  if (!deviceId) throw new Error('device id missing — call ensureDevice first');

  const body: Record<string, string> = {
    deviceId,
    appVersion: opts.appVersion,
  };
  if (opts.name !== undefined) {
    const name = opts.name.trim();
    if (!name) throw new Error('device name must be non-empty when provided');
    body.name = name;
  }
  const resp = await apiFetch(`${API_BASE_URL}/v1/devices/register`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${requireAccessToken()}`,
      'content-type': 'application/json',
      'X-Device-ID': deviceId,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    let message = `device register: ${resp.status}`;
    try {
      const errBody = (await resp.json()) as Record<string, unknown>;
      if (typeof errBody.message === 'string' && errBody.message) {
        message = errBody.message;
      }
    } catch (err) {
      console.warn('[nordly:device] register error body is not JSON', resp.status, err);
    }
    throw new Error(message);
  }

  const j = (await resp.json()) as Record<string, unknown>;
  return {
    deviceId: requireJsonString(j, 'deviceId'),
    cloudSyncEnabled: requireJsonBoolean(j, 'cloudSyncEnabled'),
    deviceLimit: requireJsonNumber(j, 'deviceLimit'),
    devicesRegistered: requireJsonNumber(j, 'devicesRegistered'),
  };
}
