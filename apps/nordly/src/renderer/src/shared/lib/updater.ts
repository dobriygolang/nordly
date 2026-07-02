import { getVersion } from '@tauri-apps/api/app';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { relaunch } from '@tauri-apps/plugin-process';
import { check, type DownloadEvent } from '@tauri-apps/plugin-updater';

import { isTauriRuntime } from '@platform/runtime';

export { isTauriRuntime };

const UPDATER_JSON_URL =
  'https://github.com/dobriygolang/nordly/releases/latest/download/latest.json';

export async function readAppVersion(): Promise<string> {
  if (!isTauriRuntime()) return 'dev';
  return getVersion();
}

/** Semver compare: 1 if a>b, -1 if a<b, 0 if equal (MAJOR.MINOR.PATCH only). */
export function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/i, '').split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.replace(/^v/i, '').split('.').map((n) => Number.parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length, 3);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

/** Version string from GitHub Release latest.json (what the in-app updater reads). */
export async function fetchPublishedVersion(): Promise<string | null> {
  if (!isTauriRuntime()) return null;
  try {
    const resp = await tauriFetch(UPDATER_JSON_URL, { cache: 'no-store' });
    if (!resp.ok) return null;
    const j = (await resp.json()) as { version?: string };
    return typeof j.version === 'string' && j.version.length > 0 ? j.version : null;
  } catch {
    return null;
  }
}

export type UpdatePhase = 'idle' | 'checking' | 'downloading' | 'installing' | 'relaunching';

export type UpdateErrorCode = 'no_release' | 'network' | 'unknown';

export type UpdateCheckResult =
  | { kind: 'unavailable' }
  | { kind: 'up_to_date' }
  | { kind: 'installed'; version: string }
  | { kind: 'error'; code: UpdateErrorCode; message: string };

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
  if (lower.includes('network') || lower.includes('timeout') || lower.includes('connection')) {
    return 'network';
  }
  return 'unknown';
}

export async function checkForUpdate(
  onPhase: (phase: UpdatePhase) => void,
  onProgress?: (downloaded: number, total: number | null) => void,
): Promise<UpdateCheckResult> {
  if (!isTauriRuntime()) return { kind: 'unavailable' };

  onPhase('checking');
  try {
    const update = await check();
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
  }
}
