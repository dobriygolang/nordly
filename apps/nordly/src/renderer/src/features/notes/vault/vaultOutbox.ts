/** Path-keyed vault file sync outbox (stubs until notes service vault RPCs ship). */

import { enqueueOutbox } from '@shared/sync/outbox';
import { SyncDeferredError } from '@shared/sync/errors';
import { OutboxOp, SyncDomain } from '@shared/sync/types';
import { scheduleSync } from '@shared/sync/SyncEngine';
import { isSyncQueueEnabled } from '@shared/sync/syncConfig';

export type VaultFileKind = 'md' | 'bin';

export interface VaultFilePutPayload {
  path: string;
  hash: string;
  mtimeMs: number;
  kind: VaultFileKind;
}

/**
 * Server List/Put/Get/DeleteVaultFile not shipped yet.
 * Keep false so we do not grow a stuck outbox while LOCAL_ONLY / stub push.
 */
export const VAULT_FILE_SYNC_READY = false;

let suppressWatchUntil = 0;
let pendingReload: (() => void) | null = null;
let pendingReloadTimer: ReturnType<typeof setTimeout> | null = null;

/** Ignore FS watch events briefly after our own writes (save↔watch loop). */
export function suppressVaultWatch(ms = 900): void {
  suppressWatchUntil = Math.max(suppressWatchUntil, Date.now() + ms);
}

export function isVaultWatchSuppressed(): boolean {
  return Date.now() < suppressWatchUntil;
}

/**
 * If a watch fires while we are writing, schedule one reload after the suppress window
 * instead of dropping the event forever.
 */
export function deferVaultWatchReload(cb: () => void): void {
  pendingReload = cb;
  if (pendingReloadTimer != null) return;
  const wait = Math.max(0, suppressWatchUntil - Date.now()) + 50;
  pendingReloadTimer = setTimeout(() => {
    pendingReloadTimer = null;
    const run = pendingReload;
    pendingReload = null;
    if (run && !isVaultWatchSuppressed()) run();
    else if (run) deferVaultWatchReload(run);
  }, wait);
}

export function cancelDeferredVaultWatchReload(): void {
  pendingReload = null;
  if (pendingReloadTimer !== null) {
    clearTimeout(pendingReloadTimer);
    pendingReloadTimer = null;
  }
}

async function contentHash(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function enqueueVaultFilePut(
  path: string,
  bodyUtf8OrBytes: string | Uint8Array,
  kind: VaultFileKind,
  mtimeMs: number,
): Promise<void> {
  if (!VAULT_FILE_SYNC_READY || !isSyncQueueEnabled()) return;
  const bytes =
    typeof bodyUtf8OrBytes === 'string'
      ? new TextEncoder().encode(bodyUtf8OrBytes)
      : bodyUtf8OrBytes;
  const hash = await contentHash(bytes);
  const payload: VaultFilePutPayload = { path, hash, mtimeMs, kind };
  await enqueueOutbox(SyncDomain.Vault, OutboxOp.FilePut, path, payload);
  scheduleSync();
}

export async function enqueueVaultFileDelete(path: string): Promise<void> {
  if (!VAULT_FILE_SYNC_READY || !isSyncQueueEnabled()) return;
  await enqueueOutbox(SyncDomain.Vault, OutboxOp.FileDelete, path, { path });
  scheduleSync();
}

/**
 * Push stub — server vault RPCs are not shipped yet.
 * Entries stay in outbox until ListVaultFiles / PutVaultFile exist.
 */
export async function pushVaultOutbox(): Promise<void> {
  throw new SyncDeferredError(
    'Filesystem vault sync is unavailable until vault file RPCs are implemented',
  );
}

/** Remap a vault-relative path after a folder rename/move (`a` → `b`, `a/x.md` → `b/x.md`). */
export function remapVaultPath(path: string, fromPrefix: string, toPrefix: string): string {
  const from = fromPrefix.replace(/\/+$/, '');
  const to = toPrefix.replace(/\/+$/, '');
  if (path === fromPrefix || path === from) return to;
  if (path.startsWith(`${from}/`)) {
    return `${to}/${path.slice(from.length + 1)}`;
  }
  return path;
}
