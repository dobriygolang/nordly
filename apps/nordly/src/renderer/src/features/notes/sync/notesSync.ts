import { requireUserId } from '@shared/db/nordlyDb';
import {
  decryptNoteFromRemote,
  encryptNoteForRemote,
} from '@features/notes/crypto/noteCrypto';
import type { WikiLinkWire } from '@features/notes/lib/wikiLinks';
import {
  noteToStored,
  remoteCreateNote,
  remoteDeleteNote,
  remoteGetNote,
  remoteListNotes,
  remoteUpdateNote,
} from '@features/notes/remote/notesRemote';
import { remoteEncryptNoteBody } from '@features/notes/remote/vaultRemote';
import {
  notesStoreGet,
  notesStoreGetRow,
  notesStoreMergeRemote,
  notesStoreReplaceId,
  notesStoreApplyRemoteAbsences,
} from '@features/notes/repository/notesStore';
import { isVaultUnlocked } from '@shared/crypto/vault';
import { isVaultEnabledSync } from '@shared/crypto/vaultPrefs';
import { getServerId, resolveEntityId, resolveNotesServerId, setServerId } from '@shared/sync/idMap';
import { SyncDeferredError } from '@shared/sync/errors';
import { removeOutbox } from '@shared/sync/outbox';
import type { OutboxEntry } from '@shared/sync/types';
import { mapPool } from '@shared/lib/mapPool';

const NOTE_PULL_CONCURRENCY = 6;

function isRemoteNotFound(err: unknown): boolean {
  return err instanceof Error && err.message.includes(': 404');
}

function requireOutboxString(payload: Record<string, unknown>, key: string, entryId: string): string {
  if (typeof payload[key] !== 'string') {
    throw new Error(`Invalid notes outbox payload: missing ${key} (${entryId})`);
  }
  return payload[key];
}

function requireOutboxWikiLinks(payload: Record<string, unknown>, entryId: string): WikiLinkWire[] {
  if (!('wikiLinks' in payload)) return [];
  const raw = payload.wikiLinks;
  if (!Array.isArray(raw)) {
    throw new Error(`Invalid notes outbox payload: wikiLinks (${entryId})`);
  }
  return raw.map((item, index) => {
    if (typeof item !== 'object' || item === null) {
      throw new Error(`Invalid notes outbox payload: wikiLinks[${index}] (${entryId})`);
    }
    const row = item as Record<string, unknown>;
    if (typeof row.linkText !== 'string') {
      throw new Error(`Invalid notes outbox payload: wikiLinks[${index}].linkText (${entryId})`);
    }
    if (typeof row.targetNoteId !== 'string') {
      throw new Error(`Invalid notes outbox payload: wikiLinks[${index}].targetNoteId (${entryId})`);
    }
    return { linkText: row.linkText, targetNoteId: row.targetNoteId };
  });
}

async function resolveNoteServerId(
  entry: OutboxEntry,
  userId: string,
  title: string,
  bodyMd: string,
  wikiLinks: WikiLinkWire[],
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

  if (e2ee) {
    const { encTitle, encBody } = await encryptNoteForRemote(title, bodyMd);
    const created = await remoteCreateNote(encTitle, encBody, wikiLinks);
    await remoteEncryptNoteBody(created.id, encBody);
    await setServerId('notes', entry.entityId, created.id, userId);
    const plain = await decryptNoteFromRemote({ ...created, encrypted: true });
    await notesStoreReplaceId(entry.entityId, plain);
    return created.id;
  }

  const created = await remoteCreateNote(title, bodyMd, wikiLinks);
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
    throw new SyncDeferredError('Vault locked — unlock in Settings to sync encrypted notes');
  }

  const localRow = await notesStoreGetRow(localId, userId);
  const wikiLinks = localRow?.wikiLinks ?? [];

  return resolveNoteServerId(
    {
      id: 'ensure',
      userId,
      domain: 'notes',
      op: 'update',
      entityId: localId,
      payload: { title: local.title, bodyMd: local.bodyMd, wikiLinks },
      createdAt: Date.now(),
      attempts: 0,
    },
    userId,
    local.title,
    local.bodyMd,
    wikiLinks,
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
  wikiLinks: WikiLinkWire[],
): Promise<void> {
  const { encTitle, encBody } = await encryptNoteForRemote(title, bodyMd);
  await remoteUpdateNote(serverId, encTitle, encBody, wikiLinks);
  await remoteEncryptNoteBody(serverId, encBody);
}

async function pushPlainNote(
  serverId: string,
  title: string,
  bodyMd: string,
  wikiLinks: WikiLinkWire[],
): Promise<void> {
  await remoteUpdateNote(serverId, title, bodyMd, wikiLinks);
}

export async function pushNotesOutbox(entry: OutboxEntry): Promise<void> {
  const userId = requireUserId();

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

  const payload = entry.payload as Record<string, unknown>;
  const title = requireOutboxString(payload, 'title', entry.id);
  const bodyMd = requireOutboxString(payload, 'bodyMd', entry.id);
  const wikiLinks = requireOutboxWikiLinks(payload, entry.id);
  const e2ee = shouldPushE2ee();

  if (isVaultEnabledSync() && !isVaultUnlocked()) {
    throw new SyncDeferredError('Vault locked — unlock in Settings to sync encrypted notes');
  }

  if (entry.op === 'create') {
    if (e2ee) {
      const { encTitle, encBody } = await encryptNoteForRemote(title, bodyMd);
      const created = await remoteCreateNote(encTitle, encBody, wikiLinks);
      await remoteEncryptNoteBody(created.id, encBody);
      await setServerId('notes', entry.entityId, created.id, userId);
      const plain = await decryptNoteFromRemote({ ...created, encrypted: true });
      await notesStoreReplaceId(entry.entityId, plain);
    } else {
      const created = await remoteCreateNote(title, bodyMd, wikiLinks);
      await setServerId('notes', entry.entityId, created.id, userId);
      await notesStoreReplaceId(entry.entityId, created);
    }
    await removeOutbox(entry.id, userId);
    return;
  }

  const serverId = await resolveNoteServerId(entry, userId, title, bodyMd, wikiLinks, e2ee);
  if (!serverId) return;

  if (entry.op === 'update') {
    try {
      if (e2ee) {
        await pushEncryptedNote(serverId, title, bodyMd, wikiLinks);
        const wire = await remoteGetNote(serverId);
        const plain = await decryptNoteFromRemote(wire);
        await notesStoreMergeRemote(noteToStored(plain, userId, true));
      } else {
        await pushPlainNote(serverId, title, bodyMd, wikiLinks);
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
  const vaultEnabled = isVaultEnabledSync();
  const vaultLocked = vaultEnabled && !isVaultUnlocked();
  const summaries = await remoteListNotes();
  const remoteIds = new Set(summaries.map((s) => s.id));

  // Fail closed before any merge — a plaintext-first probe still lets workers
  // partially apply encrypted notes when vault is locked.
  if (vaultLocked) {
    throw new SyncDeferredError('Vault locked — unlock in Settings to pull encrypted notes');
  }

  await mapPool(summaries, NOTE_PULL_CONCURRENCY, async (s) => {
    const wire = await remoteGetNote(s.id);
    if (wire.encrypted) {
      if (!vaultEnabled || !isVaultUnlocked()) {
        throw new SyncDeferredError('Vault locked — unlock in Settings to pull encrypted notes');
      }
      const plain = await decryptNoteFromRemote(wire);
      await notesStoreMergeRemote(noteToStored(plain, userId, true));
      return;
    }
    await notesStoreMergeRemote(noteToStored(wire, userId, false));
  });

  await notesStoreApplyRemoteAbsences(remoteIds, userId);
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
    const serverId = await resolveEntityId('notes', row.id, userId);
    await pushEncryptedNote(serverId, plain.title, plain.bodyMd, row.wikiLinks ?? []);
  }
}
