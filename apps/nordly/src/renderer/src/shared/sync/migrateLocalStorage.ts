import { readJson } from '@shared/lib/localDb';

import { notesStoreBulkImport } from '@features/notes/repository/notesStore';
import { tasksStoreBulkImport } from '@features/tasks/repository/tasksStore';
import { focusStoreBulkImport } from '@features/focus/repository/focusStore';
import { dbGet, dbPut, requireUserId } from '@shared/db/nordlyDb';

const LEGACY_KEYS = {
  notes: ['nordly:notes:v1', 'hone:notes:v1'],
  tasks: ['nordly:tasks:v1', 'hone:tasks:v1'],
  focus: ['nordly:focus-sessions:v1', 'hone:focus-sessions:v1'],
} as const;

function readLegacyJson<T>(keys: readonly string[], fallback: T): T {
  for (const key of keys) {
    const value = readJson<T | null>(key, null);
    if (value !== null && (typeof value !== 'object' || Object.keys(value as object).length > 0)) {
      return value;
    }
  }
  return fallback;
}

function migratedKey(userId: string): string {
  return `${userId}::migrated_from_localStorage`;
}

export async function migrateLocalStorageIfNeeded(userId: string): Promise<void> {
  const done = await dbGet<{ value: boolean }>('meta', migratedKey(userId));
  if (done?.value) return;

  const notes = readLegacyJson<Record<string, unknown>>(LEGACY_KEYS.notes, {});
  if (Object.keys(notes).length > 0) {
    await notesStoreBulkImport(userId, notes as Record<string, {
      id: string;
      title: string;
      bodyMd: string;
      createdAt: string;
      updatedAt: string;
    }>);
  }

  const tasks = readLegacyJson<Record<string, unknown>>(LEGACY_KEYS.tasks, {});
  if (Object.keys(tasks).length > 0) {
    await tasksStoreBulkImport(userId, tasks as Record<string, import('@features/tasks/api/tasks').TaskCard>);
  }

  const focus = readLegacyJson<Record<string, unknown>>(LEGACY_KEYS.focus, {});
  if (Object.keys(focus).length > 0) {
    await focusStoreBulkImport(userId, focus as Record<string, {
      id: string;
      planItemId: string;
      pinnedTitle: string;
      startedAt: string;
      endedAt: string | null;
      pomodorosCompleted: number;
      secondsFocused: number;
      mode: string;
    }>);
  }

  await dbPut('meta', { key: migratedKey(userId), userId, value: true, updatedAt: Date.now() });
}

export async function runMigrationForCurrentUser(): Promise<void> {
  const userId = requireUserId();
  await migrateLocalStorageIfNeeded(userId);
}
