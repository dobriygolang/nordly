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
  if (t) return formatLimitError(err, t);
  return err instanceof Error ? err.message : String(err);
}

export { errorMessage };
