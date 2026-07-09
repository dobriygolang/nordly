import { API_BASE_URL } from '@shared/api/config';
import { requireAccessToken } from '@shared/api/authToken';
import { apiFetch } from '@shared/api/http';
import { getDeviceId } from '@shared/api/device';
import { requireJsonBoolean, requireJsonNumber, requireJsonString } from '@shared/api/json';
import type { SyncErrorCode } from '@shared/sync/errors';

export type DeviceRegisterErrorCode = Extract<
  SyncErrorCode,
  'cloud_sync_disabled' | 'device_limit_exceeded'
>;

export class DeviceRegisterError extends Error {
  readonly code: DeviceRegisterErrorCode;

  constructor(code: DeviceRegisterErrorCode, message: string) {
    super(message);
    this.name = 'DeviceRegisterError';
    this.code = code;
  }
}

let knownRegisterBlock: DeviceRegisterErrorCode | null = null;

export function resetDeviceRegisterCache(): void {
  knownRegisterBlock = null;
}

export interface DeviceRegisterResult {
  deviceId: string;
  cloudSyncEnabled: boolean;
  deviceLimit: number;
  devicesRegistered: number;
}

function parseDeviceRegisterError(status: number, body: Record<string, unknown>): DeviceRegisterError {
  const code = typeof body.code === 'string' ? body.code : '';
  const message = typeof body.message === 'string' ? body.message : `device register: ${status}`;
  if (code === 'cloud_sync_disabled') {
    return new DeviceRegisterError('cloud_sync_disabled', message);
  }
  if (code === 'device_limit_exceeded') {
    return new DeviceRegisterError('device_limit_exceeded', message);
  }
  throw new Error(message);
}

/** Register this desktop for cloud sync (device quota). */
export async function registerSyncDevice(opts: {
  appVersion: string;
  name?: string;
}): Promise<DeviceRegisterResult> {
  if (knownRegisterBlock) {
    throw new DeviceRegisterError(knownRegisterBlock, 'device register blocked');
  }

  const deviceId = getDeviceId();
  if (!deviceId) throw new Error('device id missing — call ensureDevice first');

  const resp = await apiFetch(`${API_BASE_URL}/v1/devices/register`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${requireAccessToken()}`,
      'content-type': 'application/json',
      'X-Device-ID': deviceId,
    },
    body: JSON.stringify({
      deviceId,
      name: opts.name ?? '',
      appVersion: opts.appVersion,
    }),
  });

  if (!resp.ok) {
    let body: Record<string, unknown> = {};
    try {
      body = (await resp.json()) as Record<string, unknown>;
    } catch {
      /* ignore */
    }
    if (resp.status === 403) {
      const err = parseDeviceRegisterError(resp.status, body);
      knownRegisterBlock = err.code;
      throw err;
    }
    throw new Error(typeof body.message === 'string' ? body.message : `device register: ${resp.status}`);
  }

  const j = (await resp.json()) as Record<string, unknown>;
  return {
    deviceId: requireJsonString(j, 'deviceId'),
    cloudSyncEnabled: requireJsonBoolean(j, 'cloudSyncEnabled'),
    deviceLimit: requireJsonNumber(j, 'deviceLimit'),
    devicesRegistered: requireJsonNumber(j, 'devicesRegistered'),
  };
}
