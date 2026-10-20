import { dbGet, dbPut } from '@shared/db/nordlyDb';

export interface NotesSyncPrefs {
  enabled: boolean;
  enabledAt: string | null;
  hintDismissed: boolean;
}

export const NOTES_SYNC_PREFS_DEFAULT: NotesSyncPrefs = {
  enabled: false,
  enabledAt: null,
  hintDismissed: false,
};

function metaKey(userId: string): string {
  return `${userId}::notes_sync`;
}

interface NotesSyncRow {
  key: string;
  userId: string;
  enabled?: unknown;
  enabledAt?: unknown;
  hintDismissed?: unknown;
}

function requirePrefs(row: NotesSyncRow): NotesSyncPrefs {
  if (typeof row.enabled !== 'boolean') {
    throw new Error('notes sync prefs: enabled must be boolean');
  }
  if (row.enabledAt != null && typeof row.enabledAt !== 'string') {
    throw new Error('notes sync prefs: enabledAt must be a string or null');
  }
  if (typeof row.hintDismissed !== 'boolean') {
    throw new Error('notes sync prefs: hintDismissed must be boolean');
  }
  return {
    enabled: row.enabled,
    enabledAt: row.enabledAt ?? null,
    hintDismissed: row.hintDismissed,
  };
}

/** Missing row is the pre-choice default. A stored row with the wrong shape throws. */
export async function readNotesSyncPrefs(userId: string): Promise<NotesSyncPrefs> {
  const row = await dbGet<NotesSyncRow>('meta', metaKey(userId));
  if (!row) return { ...NOTES_SYNC_PREFS_DEFAULT };
  return requirePrefs(row);
}

export async function writeNotesSyncPrefs(userId: string, prefs: NotesSyncPrefs): Promise<void> {
  await dbPut('meta', {
    key: metaKey(userId),
    userId,
    enabled: prefs.enabled,
    enabledAt: prefs.enabledAt,
    hintDismissed: prefs.hintDismissed,
  });
}
