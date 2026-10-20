import {
  NOTES_SYNC_PREFS_DEFAULT,
  readNotesSyncPrefs,
  writeNotesSyncPrefs,
  type NotesSyncPrefs,
} from '@features/notes/repository/notesSyncPrefsStore';
import { isSyncEnabled } from '@shared/sync/syncConfig';

let cachedUserId: string | null = null;
let cached: NotesSyncPrefs = { ...NOTES_SYNC_PREFS_DEFAULT };
let prefsReady = false;

export interface NotesSyncUploadProgress {
  active: boolean;
  done: number;
  total: number;
}

let upload: NotesSyncUploadProgress = { active: false, done: 0, total: 0 };
let vaultRootMissing = false;

type Listener = () => void;
const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribeNotesSyncConsent(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function areNotesSyncPrefsReady(): boolean {
  return prefsReady && cachedUserId !== null;
}

export function getNotesSyncPrefsSync(): NotesSyncPrefs {
  return cached;
}

export function isNotesSyncConsentEnabled(): boolean {
  return prefsReady && cached.enabled;
}

/** Cloud device sync is on and this device agreed to sync notes. */
export function isNotesSyncEnabled(): boolean {
  return isSyncEnabled() && isNotesSyncConsentEnabled();
}

export function getNotesSyncUploadProgress(): NotesSyncUploadProgress {
  return upload;
}

export function setNotesSyncUploadProgress(next: NotesSyncUploadProgress): void {
  upload = next;
  notify();
}

export function isVaultRootMissing(): boolean {
  return vaultRootMissing;
}

export function setVaultRootMissing(missing: boolean): void {
  if (vaultRootMissing === missing) return;
  vaultRootMissing = missing;
  notify();
}

export async function loadNotesSyncConsent(userId: string): Promise<NotesSyncPrefs> {
  const prefs = await readNotesSyncPrefs(userId);
  cachedUserId = userId;
  cached = prefs;
  prefsReady = true;
  notify();
  return prefs;
}

export async function saveNotesSyncConsent(userId: string, prefs: NotesSyncPrefs): Promise<void> {
  await writeNotesSyncPrefs(userId, prefs);
  cachedUserId = userId;
  cached = prefs;
  prefsReady = true;
  notify();
}

export function clearNotesSyncConsentCache(): void {
  cachedUserId = null;
  cached = { ...NOTES_SYNC_PREFS_DEFAULT };
  prefsReady = false;
  upload = { active: false, done: 0, total: 0 };
  vaultRootMissing = false;
  notify();
}
