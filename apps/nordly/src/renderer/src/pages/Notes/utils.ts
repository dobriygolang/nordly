import type { NoteFolder, NoteSummary } from '@features/notes/api/notesClient';
import {
  parseOptionalDate,
  requireValidDate,
  toDayKey,
} from '@shared/lib/dates';
import {
  formatLocaleDateTime,
  formatLocaleTime,
} from '@shared/lib/localeFormat';
import { STORAGE_KEYS } from '@shared/lib/storage-keys';
export { notesErrorMessage as errorMessage } from '@features/notes/api/errorMessage';

export const NoteListStatus = {
  Loading: 'loading',
  Ready: 'ready',
  Failed: 'failed',
} as const;

export type ListState =
  | {
      status: typeof NoteListStatus.Loading;
      notes: NoteSummary[];
    }
  | {
      status: typeof NoteListStatus.Ready;
      notes: NoteSummary[];
    }
  | {
      status: typeof NoteListStatus.Failed;
      notes: NoteSummary[];
      error: string;
    };

export const INITIAL_LIST: ListState = {
  status: NoteListStatus.Loading,
  notes: [],
};

export function sameNoteFolders(a: NoteFolder[], b: NoteFolder[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const left = a[i]!;
    const right = b[i]!;
    if (
      left.id !== right.id ||
      left.name !== right.name ||
      left.parentId !== right.parentId ||
      left.updatedAt !== right.updatedAt
    ) {
      return false;
    }
  }
  return true;
}

export function sameNoteSummaries(a: NoteSummary[], b: NoteSummary[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const left = a[i]!;
    const right = b[i]!;
    if (
      left.id !== right.id ||
      left.title !== right.title ||
      left.folderId !== right.folderId ||
      left.vaultLocked !== right.vaultLocked ||
      (left.updatedAt?.getTime() ?? 0) !== (right.updatedAt?.getTime() ?? 0)
    ) {
      return false;
    }
  }
  return true;
}

export const SIDEBAR_COLLAPSED_KEY = STORAGE_KEYS.notesSidebarCollapsed;

export function formatTime(d: string | Date | null | undefined): string {
  if (!d) return '';
  const date =
    typeof d === 'string'
      ? parseOptionalDate(d, 'note timestamp')!
      : requireValidDate(d, 'note timestamp');
  if (toDayKey(date) === toDayKey(new Date())) {
    return formatLocaleTime(date);
  }
  return formatLocaleDateTime(date, undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

