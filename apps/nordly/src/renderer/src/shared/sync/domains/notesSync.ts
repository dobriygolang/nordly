import { requireUserId } from '@shared/db/nordlyDb';
import {
  decryptNoteFromRemote,
  encryptNoteForRemote,
} from '@features/notes/crypto/noteCrypto';
import {
  noteToStored,
  remoteCreateNote,
  remoteDeleteNote,
  remoteGetNote,
  remoteListNotes,
  remoteUpdateNote,
} from '@features/notes/repository/notesRemote';
import { remoteEncryptNoteBody } from '@features/notes/repository/vaultRemote';
import {
  notesStoreGet,
  notesStoreMergeRemote,
  notesStoreReplaceId,
} from '@features/notes/repository/notesStore';
import { isVaultUnlocked } from '@shared/crypto/vault';
import { isVaultEnabledSync } from '@shared/crypto/vaultPrefs';
import { getServerId, resolveEntityId, resolveNotesServerId, setServerId } from '@shared/sync/idMap';
import { removeOutbox } from '@shared/sync/outbox';
import type { OutboxEntry } from '@shared/sync/types';

function isRemoteNotFound(err: unknown): boolean {
  return err instanceof Error && err.message.includes(': 404');
}

async function resolveNoteServerId(
  entry: OutboxEntry,
  userId: string,
  title: string,
  bodyMd: string,
  e2ee: boolean,
): Promise<string | null> {
  const mapped = await getServerId('notes', entry.entityId, userId);
  if (mapped) return mapped;

  if (entry.op === 'delete') {
    return resolveNotesServerId(entry.entityId, userId);
  }

  const local = await notesStoreGet(entry.entityId, userId);
  if (!local) {
    await removeOutbox(entry.id, userId);
    return null;
  }

  const localTitle = title || local.title;
  const localBody = bodyMd || local.bodyMd;

  if (e2ee) {
    const { encTitle, encBody } = await encryptNoteForRemote(localTitle, localBody);
    const created = await remoteCreateNote(encTitle, encBody);
    await remoteEncryptNoteBody(created.id, encBody);
    await setServerId('notes', entry.entityId, created.id, userId);
    const plain = await decryptNoteFromRemote({ ...created, encrypted: true });
    await notesStoreReplaceId(entry.entityId, plain);
    return created.id;
  }

  const created = await remoteCreateNote(localTitle, localBody);
  await setServerId('notes', entry.entityId, created.id, userId);
  await notesStoreReplaceId(entry.entityId, created);
  return created.id;
}

/** Create remote note + id_map when a local note has never been synced (e.g. publish). */
export async function ensureNoteServerId(localId: string): Promise<string | null> {
  const userId = requireUserId();
  const mapped = await getServerId('notes', localId, userId);
  if (mapped) return mapped;

  const local = await notesStoreGet(localId, userId);
  if (!local) return null;

  if (isVaultEnabledSync() && !isVaultUnlocked()) {
    throw new Error('Vault locked — unlock in Settings to sync encrypted notes');
  }

  return resolveNoteServerId(
    {
      id: 'ensure',
      userId,
      domain: 'notes',
      op: 'update',
      entityId: localId,
      payload: {},
      createdAt: Date.now(),
      attempts: 0,
    },
    userId,
    local.title,
    local.bodyMd,
    shouldPushE2ee(),
  );
}

function shouldPushE2ee(): boolean {
  return isVaultEnabledSync() && isVaultUnlocked();
}

async function pushEncryptedNote(
  serverId: string,
  title: string,
  bodyMd: string,
): Promise<void> {
  const { encTitle, encBody } = await encryptNoteForRemote(title, bodyMd);
  await remoteUpdateNote(serverId, encTitle, encBody);
  await remoteEncryptNoteBody(serverId, encBody);
}

async function pushPlainNote(serverId: string, title: string, bodyMd: string): Promise<void> {
  await remoteUpdateNote(serverId, title, bodyMd);
}

export async function pushNotesOutbox(entry: OutboxEntry): Promise<void> {
  const userId = requireUserId();
  const payload = entry.payload as Record<string, unknown>;
  const title = String(payload.title ?? 'Untitled');
  const bodyMd = String(payload.bodyMd ?? '');
  const e2ee = shouldPushE2ee();

  if (isVaultEnabledSync() && !isVaultUnlocked()) {
    throw new Error('Vault locked — unlock in Settings to sync encrypted notes');
  }

  if (entry.op === 'create') {
    if (e2ee) {
      const { encTitle, encBody } = await encryptNoteForRemote(title, bodyMd);
      const created = await remoteCreateNote(encTitle, encBody);
      await remoteEncryptNoteBody(created.id, encBody);
      await setServerId('notes', entry.entityId, created.id, userId);
      const plain = await decryptNoteFromRemote({ ...created, encrypted: true });
      await notesStoreReplaceId(entry.entityId, plain);
    } else {
      const created = await remoteCreateNote(title, bodyMd);
      await setServerId('notes', entry.entityId, created.id, userId);
      await notesStoreReplaceId(entry.entityId, created);
    }
    await removeOutbox(entry.id, userId);
    return;
  }

  if (entry.op === 'delete') {
    const serverId = await resolveNotesServerId(entry.entityId, userId);
    try {
      await remoteDeleteNote(serverId);
    } catch (err) {
      if (isRemoteNotFound(err)) {
        await removeOutbox(entry.id, userId);
        return;
      }
      throw err;
    }
    await removeOutbox(entry.id, userId);
    return;
  }

  const serverId = await resolveNoteServerId(entry, userId, title, bodyMd, e2ee);
  if (!serverId) return;

  if (entry.op === 'update') {
    try {
      if (e2ee) {
        await pushEncryptedNote(serverId, title, bodyMd);
        const wire = await remoteGetNote(serverId);
        const plain = await decryptNoteFromRemote(wire);
        await notesStoreMergeRemote(noteToStored(plain, userId, true));
      } else {
        await pushPlainNote(serverId, title, bodyMd);
        const wire = await remoteGetNote(serverId);
        await notesStoreMergeRemote(noteToStored(wire, userId, false));
      }
    } catch (err) {
      if (isRemoteNotFound(err)) {
        await removeOutbox(entry.id, userId);
        return;
      }
      throw err;
    }
    await removeOutbox(entry.id, userId);
    return;
  }
}

export async function pullNotes(): Promise<void> {
  const userId = requireUserId();
  const e2ee = isVaultEnabledSync();
  const summaries = await remoteListNotes();
  for (const s of summaries) {
    try {
      const wire = await remoteGetNote(s.id);
      if (wire.encrypted) {
        if (!e2ee || !isVaultUnlocked()) continue;
        const plain = await decryptNoteFromRemote(wire);
        await notesStoreMergeRemote(noteToStored(plain, userId, true));
      } else {
        await notesStoreMergeRemote(noteToStored(wire, userId, false));
      }
    } catch {
      /* skip until vault unlocked or corrupt row */
    }
  }
}

/** Re-push all local notes as encrypted after enabling vault. */
export async function pushAllNotesEncrypted(): Promise<void> {
  if (!isVaultEnabledSync() || !isVaultUnlocked()) return;
  const { notesStoreAll, decryptAtRest } = await import('@features/notes/repository/notesStore');
  const userId = requireUserId();
  const rows = await notesStoreAll(userId);
  for (const row of rows) {
    if (row.deleted) continue;
    const plain = await decryptAtRest(row);
    const serverId = (await resolveEntityId('notes', row.id, userId));
    await pushEncryptedNote(serverId, plain.title, plain.bodyMd);
  }
}
