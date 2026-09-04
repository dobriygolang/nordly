/** Push filesystem-vault markdown to notes CRUD (path-keyed via id_map). */

import { isApiHttpError } from '@shared/api/errors';
import { requireUserId } from '@shared/db/nordlyDb';
import { isVaultUnlocked } from '@shared/crypto/vault';
import { areVaultPrefsReady, isVaultEnabledSync } from '@shared/crypto/vaultPrefs';
import { mapPool } from '@shared/lib/mapPool';
import { SyncDeferredError } from '@shared/sync/errors';
import { clearServerId, getServerId, setServerId } from '@shared/sync/idMap';
import { hasOutboxForEntity, removeOutbox } from '@shared/sync/outbox';
import { OutboxOp, SyncDomain, type OutboxEntry } from '@shared/sync/types';
import {
  decryptNoteFromRemote,
  encryptNoteForRemote,
} from '@features/notes/crypto/noteCrypto';
import {
  remoteCreateNote,
  remoteDeleteNote,
  remoteGetNote,
  remoteListNotes,
  remoteUpdateNote,
} from '@features/notes/remote/notesRemote';
import { remoteEncryptNoteBody } from '@features/notes/remote/vaultRemote';
import { vaultGetConfig, vaultReadNote, vaultWriteNote } from '@features/notes/vault/ipc';
import { suppressVaultWatch } from '@features/notes/vault/vaultOutbox';

import { withNotesRemoteMutation } from './notesSync';

const VAULT_PULL_CONCURRENCY = 4;

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
    throw new SyncDeferredError('Vault locked — unlock in Settings to sync encrypted notes');
  }
}

/** Relative vault markdown path used as the notes-API title for round-trip pull. */
export function isVaultRelPath(path: string): boolean {
  const p = path.trim();
  if (!p.toLowerCase().endsWith('.md')) return false;
  if (p.startsWith('/') || p.includes('\\') || p.includes('\0')) return false;
  const segments = p.split('/');
  return segments.every((seg) => seg !== '' && seg !== '.' && seg !== '..');
}

function payloadPath(entry: OutboxEntry): string {
  const raw = entry.payload as { path?: unknown };
  if (typeof raw.path === 'string' && raw.path.trim()) return raw.path.trim();
  return entry.entityId.trim();
}

async function deleteRemoteVaultNote(
  path: string,
  userId: string,
): Promise<void> {
  const serverId = await getServerId(SyncDomain.Vault, path, userId);
  if (!serverId) return;
  try {
    await remoteDeleteNote(serverId);
  } catch (err) {
    if (!isRemoteNotFound(err)) throw err;
  }
  await clearServerId(SyncDomain.Vault, path, userId);
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
    await setServerId(SyncDomain.Vault, path, created.id, userId);
    await remoteEncryptNoteBody(created.id, encBody);
    return;
  }
  const created = await remoteCreateNote(title, bodyMd);
  await setServerId(SyncDomain.Vault, path, created.id, userId);
}

async function upsertRemoteVaultNote(
  path: string,
  title: string,
  bodyMd: string,
  userId: string,
): Promise<void> {
  requireE2eeUnlocked();
  const e2ee = shouldPushE2ee();
  const serverId = await getServerId(SyncDomain.Vault, path, userId);

  if (!serverId) {
    await createRemoteVaultNote(path, title, bodyMd, userId, e2ee);
    return;
  }

  try {
    if (e2ee) {
      const { encTitle, encBody } = await encryptNoteForRemote(title, bodyMd);
      await remoteUpdateNote(serverId, encTitle, encBody);
      await remoteEncryptNoteBody(serverId, encBody);
      return;
    }
    await remoteUpdateNote(serverId, title, bodyMd);
  } catch (err) {
    if (!isRemoteNotFound(err)) throw err;
    await clearServerId(SyncDomain.Vault, path, userId);
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
  } catch {
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
    await removeOutbox(entry.id, userId);
    return;
  }
  await deleteRemoteVaultNote(path, userId);
  await removeOutbox(entry.id, userId);
}

export async function pushVaultOutbox(entry: OutboxEntry): Promise<void> {
  if (entry.domain !== SyncDomain.Vault) {
    throw new Error(`pushVaultOutbox: unexpected domain ${entry.domain}`);
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
  const config = await vaultGetConfig();
  if (!config?.root.trim()) return;
  requireVaultPrefsReady();
  requireE2eeUnlocked();
  const userId = requireUserId();
  const summaries = await remoteListNotes();

  await mapPool(summaries, VAULT_PULL_CONCURRENCY, async (summary) => {
    const wire = await remoteGetNote(summary.id);
    let path = wire.title;
    let bodyMd = wire.bodyMd;
    if (wire.encrypted) {
      if (!isVaultEnabledSync() || !isVaultUnlocked()) return;
      const plain = await decryptNoteFromRemote(wire);
      path = plain.title;
      bodyMd = plain.bodyMd;
    }
    if (!isVaultRelPath(path)) return;
    if (
      (await hasOutboxForEntity(SyncDomain.Vault, path, OutboxOp.FilePut, userId)) ||
      (await hasOutboxForEntity(SyncDomain.Vault, path, OutboxOp.FileDelete, userId))
    ) {
      return;
    }

    try {
      const local = await vaultReadNote(path);
      const remoteMs = wire.updatedAt?.getTime() ?? 0;
      if (local.updatedAtMs >= remoteMs) {
        await setServerId(SyncDomain.Vault, path, wire.id, userId);
        return;
      }
      if (local.bodyMd === bodyMd) {
        await setServerId(SyncDomain.Vault, path, wire.id, userId);
        return;
      }
    } catch {
      /* local file missing — write from server */
    }

    suppressVaultWatch();
    await vaultWriteNote(path, bodyMd);
    await setServerId(SyncDomain.Vault, path, wire.id, userId);
  });
}
