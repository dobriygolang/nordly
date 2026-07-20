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

/** Retry device_limit after this — plan upgrades / device deletes can free a slot. */
const DEVICE_LIMIT_CACHE_MS = 60_000;

let knownRegisterBlock: DeviceRegisterErrorCode | null = null;
let knownRegisterBlockUntil = 0;

export function resetDeviceRegisterCache(): void {
  knownRegisterBlock = null;
  knownRegisterBlockUntil = 0;
}

function cachedRegisterBlock(): DeviceRegisterErrorCode | null {
  if (!knownRegisterBlock) return null;
  if (knownRegisterBlock === 'cloud_sync_disabled') return knownRegisterBlock;
  if (Date.now() < knownRegisterBlockUntil) return knownRegisterBlock;
  knownRegisterBlock = null;
  knownRegisterBlockUntil = 0;
  return null;
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
  const blocked = cachedRegisterBlock();
  if (blocked) {
    throw new DeviceRegisterError(blocked, 'device register blocked');
  }

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
    let body: Record<string, unknown> = {};
    try {
      body = (await resp.json()) as Record<string, unknown>;
    } catch (err) {
      console.warn('[nordly:device] register error body is not JSON', resp.status, err);
    }
    if (resp.status === 403) {
      const err = parseDeviceRegisterError(resp.status, body);
      knownRegisterBlock = err.code;
      knownRegisterBlockUntil =
        err.code === 'device_limit_exceeded' ? Date.now() + DEVICE_LIMIT_CACHE_MS : Number.POSITIVE_INFINITY;
      throw err;
    }
    throw new Error(typeof body.message === 'string' ? body.message : `device register: ${resp.status}`);
  }

  resetDeviceRegisterCache();
  const j = (await resp.json()) as Record<string, unknown>;
  return {
    deviceId: requireJsonString(j, 'deviceId'),
    cloudSyncEnabled: requireJsonBoolean(j, 'cloudSyncEnabled'),
    deviceLimit: requireJsonNumber(j, 'deviceLimit'),
    devicesRegistered: requireJsonNumber(j, 'devicesRegistered'),
  };
}
