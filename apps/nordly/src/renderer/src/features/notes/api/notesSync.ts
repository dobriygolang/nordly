import { remoteListNotes } from '@features/notes/remote/notesRemote';
import { vaultGetConfig, vaultListNotes, vaultReadNote } from '@features/notes/vault/ipc';
import { enqueueVaultFilePut } from '@features/notes/vault/vaultOutbox';
import {
  areNotesSyncPrefsReady,
  clearNotesSyncConsentCache,
  getNotesSyncPrefsSync,
  getNotesSyncUploadProgress,
  isNotesSyncConsentEnabled,
  isNotesSyncEnabled,
  isVaultRootMissing,
  loadNotesSyncConsent,
  saveNotesSyncConsent,
  setNotesSyncUploadProgress,
  subscribeNotesSyncConsent,
} from '@features/notes/lib/notesSyncConsent';
import { isVaultUnlocked, subscribeVault } from '@shared/crypto/vault';
import { isVaultEnabledSync, subscribeVaultEnabled } from '@shared/crypto/vaultPrefs';
import { requireUserId } from '@shared/db/nordlyDb';
import { useSyncStore } from '@shared/model/sync';
import { clearOutboxDomain } from '@shared/sync/outbox';
import { scheduleSync } from '@shared/sync/SyncEngine';
import { isCloudApiAvailable, isCloudEnabled, isSyncEnabled } from '@shared/sync/syncConfig';
import { SyncDomain, SyncStatus } from '@shared/sync/types';

export {
  clearNotesSyncConsentCache,
  isNotesSyncEnabled,
  loadNotesSyncConsent,
};

export type NotesSyncStatus =
  | { kind: 'unavailable'; reason: 'local_build' | 'signed_out' }
  | { kind: 'off'; hintDismissed: boolean }
  | { kind: 'paused'; reason: 'encryption_locked' | 'vault_root_missing' }
  | { kind: 'syncing'; done: number; total: number }
  | { kind: 'synced'; at: Date | null; encrypted: boolean }
  | { kind: 'error'; message: string };

export interface NotesSyncEnablePlan {
  folder: string;
  localNoteCount: number;
  remoteNoteCount: number;
}

export type PublishBlockReason = 'sync_off' | 'encryption_locked';

export class NotesSyncBlockedError extends Error {
  readonly reason: PublishBlockReason;

  constructor(reason: PublishBlockReason) {
    super(reason);
    this.name = 'NotesSyncBlockedError';
    this.reason = reason;
  }
}

export function isNotesSyncHintDismissed(): boolean {
  return areNotesSyncPrefsReady() && getNotesSyncPrefsSync().hintDismissed;
}

export function getNotesSyncStatus(): NotesSyncStatus {
  if (!isCloudEnabled()) return { kind: 'unavailable', reason: 'local_build' };
  if (!areNotesSyncPrefsReady()) return { kind: 'off', hintDismissed: true };
  if (!isCloudApiAvailable()) return { kind: 'unavailable', reason: 'signed_out' };
  if (!isNotesSyncConsentEnabled()) {
    return { kind: 'off', hintDismissed: getNotesSyncPrefsSync().hintDismissed };
  }
  if (isVaultEnabledSync() && !isVaultUnlocked()) {
    return { kind: 'paused', reason: 'encryption_locked' };
  }
  if (isVaultRootMissing()) {
    return { kind: 'paused', reason: 'vault_root_missing' };
  }
  const sync = useSyncStore.getState();
  if (sync.lastError) return { kind: 'error', message: sync.lastError };
  const progress = getNotesSyncUploadProgress();
  if (progress.active || sync.status === SyncStatus.Syncing) {
    return {
      kind: 'syncing',
      done: progress.active ? progress.done : 0,
      total: progress.active ? progress.total : sync.pendingCount,
    };
  }
  return {
    kind: 'synced',
    at: sync.lastSyncedAt == null ? null : new Date(sync.lastSyncedAt),
    encrypted: isVaultEnabledSync(),
  };
}

export function subscribeNotesSyncStatus(cb: (status: NotesSyncStatus) => void): () => void {
  let last = '';
  const emit = (): void => {
    const next = getNotesSyncStatus();
    const serialized = JSON.stringify(next);
    if (serialized === last) return;
    last = serialized;
    cb(next);
  };
  const unsubConsent = subscribeNotesSyncConsent(emit);
  const unsubVault = subscribeVault(emit);
  const unsubEnabled = subscribeVaultEnabled(emit);
  const unsubSync = useSyncStore.subscribe(emit);
  emit();
  return () => {
    unsubConsent();
    unsubVault();
    unsubEnabled();
    unsubSync();
  };
}

export function requirePublishAllowed():
  | { ok: true }
  | { ok: false; reason: PublishBlockReason } {
  if (!isNotesSyncConsentEnabled()) return { ok: false, reason: 'sync_off' };
  if (isVaultEnabledSync() && !isVaultUnlocked()) {
    return { ok: false, reason: 'encryption_locked' };
  }
  return { ok: true };
}

export function assertPublishAllowed(): void {
  const gate = requirePublishAllowed();
  if (!gate.ok) throw new NotesSyncBlockedError(gate.reason);
}

export async function countRemoteNotes(): Promise<number> {
  if (!isCloudApiAvailable()) return 0;
  return (await remoteListNotes()).length;
}

export async function planNotesSyncEnable(): Promise<NotesSyncEnablePlan> {
  const config = await vaultGetConfig();
  const folder = config?.root.trim() ?? '';
  if (!folder) throw new Error('notes vault is not configured');
  const local = await vaultListNotes();
  const remoteNoteCount = isCloudApiAvailable() ? (await remoteListNotes()).length : 0;
  return { folder, localNoteCount: local.length, remoteNoteCount };
}

export async function enableNotesSync(opts: { encrypt: boolean }): Promise<void> {
  if (!isSyncEnabled()) {
    throw new Error('notes sync requires a registered device');
  }
  if (opts.encrypt && !isVaultEnabledSync()) {
    throw new Error('notes sync encryption is not configured');
  }
  if (opts.encrypt && !isVaultUnlocked()) {
    throw new Error('notes sync encryption is locked');
  }
  const userId = requireUserId();
  const prev = areNotesSyncPrefsReady() ? getNotesSyncPrefsSync() : await loadNotesSyncConsent(userId);
  await saveNotesSyncConsent(userId, {
    enabled: true,
    enabledAt: new Date().toISOString(),
    hintDismissed: prev.hintDismissed,
  });
  const notes = await vaultListNotes();
  setNotesSyncUploadProgress({ active: true, done: 0, total: notes.length });
  try {
    for (let index = 0; index < notes.length; index += 1) {
      const meta = notes[index];
      if (!meta) throw new Error('notes sync: vault list has a hole');
      const content = await vaultReadNote(meta.path);
      await enqueueVaultFilePut(meta.path, content.bodyMd, 'md', content.updatedAtMs);
      setNotesSyncUploadProgress({ active: true, done: index + 1, total: notes.length });
    }
  } finally {
    setNotesSyncUploadProgress({ active: false, done: notes.length, total: notes.length });
  }
  scheduleSync();
}

export async function disableNotesSync(): Promise<void> {
  const userId = requireUserId();
  const prev = areNotesSyncPrefsReady() ? getNotesSyncPrefsSync() : await loadNotesSyncConsent(userId);
  await saveNotesSyncConsent(userId, {
    enabled: false,
    enabledAt: null,
    hintDismissed: prev.hintDismissed,
  });
  await clearOutboxDomain(SyncDomain.Vault, userId);
}

export async function dismissNotesSyncHint(): Promise<void> {
  const userId = requireUserId();
  const prev = areNotesSyncPrefsReady() ? getNotesSyncPrefsSync() : await loadNotesSyncConsent(userId);
  await saveNotesSyncConsent(userId, { ...prev, hintDismissed: true });
}
