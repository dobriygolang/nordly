/** Push filesystem-vault markdown through the vault sync index. */

import { isApiHttpError } from '@shared/api/errors';
import { requireUserId } from '@shared/db/nordlyDb';
import { isNotesSyncEnabled } from '@features/notes/lib/notesSyncConsent';
import { isVaultUnlocked } from '@shared/crypto/vault';
import { areVaultPrefsReady, isVaultEnabledSync } from '@shared/crypto/vaultPrefs';
import { SyncDeferredError } from '@shared/sync/errors';
import { isMissingVaultNote, isVaultRelPath } from '@features/notes/lib/vaultPath';
import {
  deleteVaultSyncIndex,
  getVaultSyncIndex,
  putVaultSyncIndex,
} from '@features/notes/repository/vaultSyncIndexStore';
import { removeOutbox } from '@shared/sync/outbox';
import { OutboxOp, SyncDomain, type OutboxEntry } from '@shared/sync/types';
import { encryptNoteForRemote } from '@features/notes/crypto/noteCrypto';
import {
  remoteCreateNote,
  remoteDeleteNote,
  remoteUpdateNote,
} from '@features/notes/remote/notesRemote';
import { remoteEncryptNoteBody } from '@features/notes/remote/vaultRemote';
import { vaultGetConfig, vaultReadNote } from '@features/notes/vault/ipc';

import { withNotesRemoteMutation } from './notesSync';
import { hashVaultText, reconcileVault } from './vaultReconcile';

function isRemoteNotFound(err: unknown): boolean {
  return isApiHttpError(err, 404);
}

function requireVaultPrefsReady(): void {
  if (!areVaultPrefsReady()) {
    throw new SyncDeferredError('Vault prefs not loaded');
  }
}

function shouldPushE2ee(): boolean {
  return isVaultEnabledSync() && isVaultUnlocked();
}

function requireE2eeUnlocked(): void {
  if (isVaultEnabledSync() && !isVaultUnlocked()) {
    throw new SyncDeferredError('Notes are locked. Unlock them in Settings so sync can continue.');
  }
}

export { isVaultRelPath };

function payloadPath(entry: OutboxEntry): string {
  const raw = entry.payload as { path?: unknown };
  if (typeof raw.path === 'string' && raw.path.trim()) return raw.path.trim();
  return entry.entityId.trim();
}

async function vaultServerId(path: string, userId: string): Promise<string | null> {
  const row = await getVaultSyncIndex(userId, path);
  return row?.serverId ?? null;
}

async function rememberVaultFile(
  path: string,
  serverId: string,
  bodyMd: string,
  remoteUpdatedAt: Date | null,
  userId: string,
): Promise<void> {
  if (!remoteUpdatedAt) throw new Error(`vault sync: remote note ${serverId} has no updatedAt`);
  const hash = await hashVaultText(bodyMd);
  await putVaultSyncIndex({
    userId,
    path,
    serverId,
    hash,
    remoteUpdatedAt: remoteUpdatedAt.toISOString(),
  });
}

async function deleteRemoteVaultNote(
  path: string,
  userId: string,
): Promise<void> {
  const serverId = await vaultServerId(path, userId);
  if (!serverId) return;
  try {
    await remoteDeleteNote(serverId);
  } catch (err) {
    if (!isRemoteNotFound(err)) throw err;
  }
  await deleteVaultSyncIndex(userId, path);
}

async function createRemoteVaultNote(
  path: string,
  title: string,
  bodyMd: string,
  userId: string,
  e2ee: boolean,
): Promise<void> {
  if (e2ee) {
    const { encTitle, encBody } = await encryptNoteForRemote(title, bodyMd);
    const created = await remoteCreateNote(encTitle, encBody);
    await rememberVaultFile(path, created.id, bodyMd, created.updatedAt, userId);
    await remoteEncryptNoteBody(created.id, encBody);
    return;
  }
  const created = await remoteCreateNote(title, bodyMd);
  await rememberVaultFile(path, created.id, bodyMd, created.updatedAt, userId);
}

async function upsertRemoteVaultNote(
  path: string,
  title: string,
  bodyMd: string,
  userId: string,
): Promise<void> {
  requireE2eeUnlocked();
  const e2ee = shouldPushE2ee();
  const serverId = await vaultServerId(path, userId);

  if (!serverId) {
    await createRemoteVaultNote(path, title, bodyMd, userId, e2ee);
    return;
  }

  try {
    if (e2ee) {
      const { encTitle, encBody } = await encryptNoteForRemote(title, bodyMd);
      const updated = await remoteUpdateNote(serverId, encTitle, encBody);
      await remoteEncryptNoteBody(serverId, encBody);
      await rememberVaultFile(path, serverId, bodyMd, updated.updatedAt, userId);
      return;
    }
    const updated = await remoteUpdateNote(serverId, title, bodyMd);
    await rememberVaultFile(path, serverId, bodyMd, updated.updatedAt, userId);
  } catch (err) {
    if (!isRemoteNotFound(err)) throw err;
    await deleteVaultSyncIndex(userId, path);
    await createRemoteVaultNote(path, title, bodyMd, userId, e2ee);
  }
}

async function pushFilePut(entry: OutboxEntry, userId: string): Promise<void> {
  const path = payloadPath(entry);
  if (!isVaultRelPath(path)) {
    throw new Error(`vault file_put: invalid path (${entry.id})`);
  }
  const kind = (entry.payload as { kind?: unknown }).kind;
  if (kind !== 'md') {
    await removeOutbox(entry.id, userId);
    return;
  }

  let note: Awaited<ReturnType<typeof vaultReadNote>>;
  try {
    note = await vaultReadNote(path);
  } catch (err) {
    if (!isMissingVaultNote(err)) throw err;
    await deleteRemoteVaultNote(path, userId);
    await removeOutbox(entry.id, userId);
    return;
  }

  await upsertRemoteVaultNote(path, note.path, note.bodyMd, userId);
  await removeOutbox(entry.id, userId);
}

async function pushFileDelete(entry: OutboxEntry, userId: string): Promise<void> {
  const path = payloadPath(entry);
  if (!isVaultRelPath(path)) {
    throw new Error(`vault file_delete: invalid path (${entry.id})`);
  }
  await deleteRemoteVaultNote(path, userId);
  await removeOutbox(entry.id, userId);
}

export async function pushVaultOutbox(entry: OutboxEntry): Promise<void> {
  if (entry.domain !== SyncDomain.Vault) {
    throw new Error(`pushVaultOutbox: unexpected domain ${entry.domain}`);
  }
  if (!isNotesSyncEnabled()) {
    throw new SyncDeferredError('Notes sync is off');
  }
  requireVaultPrefsReady();
  return withNotesRemoteMutation(async () => {
    const userId = requireUserId();
    if (entry.op === OutboxOp.FilePut) {
      await pushFilePut(entry, userId);
      return;
    }
    await pushFileDelete(entry, userId);
  });
}

export async function pullVaultFiles(): Promise<void> {
  if (!isNotesSyncEnabled()) return;
  const config = await vaultGetConfig();
  if (!config?.root.trim()) return;
  requireVaultPrefsReady();
  requireE2eeUnlocked();
  await reconcileVault();
}
