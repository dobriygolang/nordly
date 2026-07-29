import type { NoteSummary } from '@features/notes/api/notesClient';

export interface ListState {
  status: 'loading' | 'ok' | 'error';
  notes: NoteSummary[];
  error: string | null;
}

export const INITIAL_LIST: ListState = { status: 'loading', notes: [], error: null };

export const SIDEBAR_COLLAPSED_KEY = 'nordly:notes:sidebar-collapsed';

export function formatTime(d: string | Date | null | undefined): string {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (!Number.isFinite(dt.getTime())) return '';
  const today = new Date();
  const sameDay =
    dt.getFullYear() === today.getFullYear() &&
    dt.getMonth() === today.getMonth() &&
    dt.getDate() === today.getDate();
  if (sameDay) {
    return dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return dt.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

import { formatLimitError } from '@shared/api/limitErrors';
import { AttachmentError } from '@features/notes/lib/noteAttachments';

function errorMessage(err: unknown, t?: (key: string) => string): string {
  if (err instanceof AttachmentError && t) {
    const key = `nordly.notes.attachment.${err.code}`;
    const msg = t(key);
    if (msg !== key) return msg;
  }
  const raw = err instanceof Error ? err.message : String(err);
  if (t) {
    const mapped = mapVaultFsError(raw, t);
    if (mapped) return mapped;
    return formatLimitError(err, t);
  }
  return raw;
}

function mapVaultFsError(raw: string, t: (key: string) => string): string | null {
  const lower = raw.toLowerCase();
  const table: Array<[RegExp | string, string]> = [
    ['notes vault is not configured', 'nordly.notes.vault_fs.not_configured'],
    ['path escape', 'nordly.notes.vault_fs.path_escape'],
    ['vault root must be an absolute path', 'nordly.notes.vault_fs.absolute_root'],
    ['vault root is not a directory', 'nordly.notes.vault_fs.not_directory'],
    ['vault root inaccessible', 'nordly.notes.vault_fs.inaccessible'],
    ['image exceeds 5 mib', 'nordly.notes.attachment.too_large'],
    ['unsupported image type', 'nordly.notes.attachment.bad_type'],
    ['permission denied', 'nordly.notes.vault_fs.permission_denied'],
    ['operation not permitted', 'nordly.notes.vault_fs.permission_denied'],
  ];
  for (const [needle, key] of table) {
    const hit =
      typeof needle === 'string' ? lower.includes(needle) : needle.test(lower);
    if (!hit) continue;
    const msg = t(key);
    if (msg !== key) return msg;
  }
  return null;
}

export { errorMessage };
