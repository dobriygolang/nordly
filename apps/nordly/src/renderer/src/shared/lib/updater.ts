import { getVersion } from '@tauri-apps/api/app';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { relaunch } from '@tauri-apps/plugin-process';
import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater';

import { isTauriRuntime } from '@platform/runtime';

export { isTauriRuntime };

/** Public updater + installer CDN (same files as /download). */
export const NORDLY_UPDATER_JSON_URL = 'https://trynordly.app/desktop/latest.json';

export async function readAppVersion(): Promise<string> {
  if (!isTauriRuntime()) return 'dev';
  return getVersion();
}

/** Semver compare: 1 if a>b, -1 if a<b, 0 if equal (MAJOR.MINOR.PATCH only). */
export function compareSemver(a: string, b: string): number {
  const parse = (v: string): number[] =>
    v.replace(/^v/i, '').split('.').map((n) => {
      const part = Number.parseInt(n, 10);
      if (!Number.isFinite(part) || part < 0) {
        throw new Error(`Invalid semver part in ${v}`);
      }
      return part;
    });
  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.length, pb.length, 3);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

/** Version string from published updater manifest on trynordly.app/desktop. */
export async function fetchPublishedVersion(): Promise<string | null> {
  if (!isTauriRuntime()) return null;
  const resp = await tauriFetch(NORDLY_UPDATER_JSON_URL, { cache: 'no-store' });
  if (!resp.ok) {
    throw new Error(`updater manifest HTTP ${resp.status}`);
  }
  const j = (await resp.json()) as { version?: string };
  if (typeof j.version !== 'string' || j.version.length === 0) {
    throw new Error('updater manifest missing version');
  }
  return j.version;
}

export type UpdatePhase = 'idle' | 'checking' | 'downloading' | 'installing' | 'relaunching';

export type UpdateErrorCode = 'no_release' | 'network' | 'unknown';

export type UpdateCheckResult =
  | { kind: 'unavailable' }
  | { kind: 'cancelled' }
  | { kind: 'up_to_date' }
  | { kind: 'installed'; version: string }
  | { kind: 'error'; code: UpdateErrorCode; message: string };

export interface UpdateCheckEventDetail {
  published?: string;
  installed?: string;
  phase?: UpdatePhase;
  error?: Extract<UpdateCheckResult, { kind: 'error' }>;
}

export function classifyUpdateError(message: string): UpdateErrorCode {
  const lower = message.toLowerCase();
  if (
    lower.includes('valid release json') ||
    lower.includes('404') ||
    lower.includes('not found') ||
    lower.includes('failed to fetch')
  ) {
    return 'no_release';
  }
  if (
    lower.includes('network') ||
    lower.includes('timeout') ||
    lower.includes('connection') ||
    lower.includes('manifest http')
  ) {
    return 'network';
  }
  return 'unknown';
}

interface UpdateListener {
  onPhase: (phase: UpdatePhase) => void;
  onProgress?: (downloaded: number, total: number | null) => void;
  shouldInstall?: () => boolean;
}
const updateListeners = new Set<UpdateListener>();
let activeUpdate: Promise<UpdateCheckResult> | null = null;
let currentPhase: UpdatePhase = 'idle';

/** Manual and automatic checks share one download/install operation. */
export async function checkForUpdate(
  onPhase: (phase: UpdatePhase) => void,
  onProgress?: (downloaded: number, total: number | null) => void,
  shouldInstall?: () => boolean,
): Promise<UpdateCheckResult> {
  if (!isTauriRuntime()) return { kind: 'unavailable' };
  const listener = { onPhase, onProgress, shouldInstall };
  updateListeners.add(listener);
  try {
    if (!activeUpdate) {
      activeUpdate = performUpdate(
        (phase) => {
          currentPhase = phase;
          for (const subscriber of updateListeners) subscriber.onPhase(phase);
        },
        (downloaded, total) => {
          for (const subscriber of updateListeners) subscriber.onProgress?.(downloaded, total);
        },
        () => [...updateListeners].some((subscriber) => subscriber.shouldInstall?.() ?? true),
      ).finally(() => { activeUpdate = null; });
    } else {
      onPhase(currentPhase);
    }
    return await activeUpdate;
  } finally {
    updateListeners.delete(listener);
  }
}

async function performUpdate(
  onPhase: (phase: UpdatePhase) => void,
  onProgress: ((downloaded: number, total: number | null) => void) | undefined,
  shouldInstall: () => boolean,
): Promise<UpdateCheckResult> {
  let update: Update | null = null;
  onPhase('checking');
  try {
    update = await check();
    if (!shouldInstall()) {
      onPhase('idle');
      return { kind: 'cancelled' };
    }
    if (!update) {
      onPhase('idle');
      const current = await readAppVersion();
      const published = await fetchPublishedVersion();
      if (published && compareSemver(published, current) > 0) {
        return {
          kind: 'error',
          code: 'unknown',
          message: `published ${published} > installed ${current} but updater returned none`,
        };
      }
      return { kind: 'up_to_date' };
    }

    onPhase('downloading');
    await update.downloadAndInstall((event: DownloadEvent) => {
      if (event.event === 'Started') {
        onProgress?.(0, event.data.contentLength ?? null);
      } else if (event.event === 'Progress') {
        onProgress?.(event.data.chunkLength, null);
      }
    });

    onPhase('relaunching');
    await relaunch();
    return { kind: 'installed', version: update.version };
  } catch (err) {
    onPhase('idle');
    const message = err instanceof Error ? err.message : String(err);
    return { kind: 'error', code: classifyUpdateError(message), message };
  } finally {
    // Native resource cleanup must not replace an install result with a teardown error.
    await update?.close().catch((error) => console.warn('[nordly:updater] cleanup failed', error));
  }
}
