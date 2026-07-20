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
import { hasOutboxForEntity, removeOutbox, removeOutboxForEntity } from '@shared/sync/outbox';
import type { OutboxEntry } from '@shared/sync/types';
import { mapPool } from '@shared/lib/mapPool';
import {
  remoteDeleteAttachment,
  remoteGetAttachment,
  remoteListAttachments,
  remotePutAttachment,
} from '@features/notes/remote/attachmentsRemote';
import {
  attachmentsStoreDeleteForNote,
  attachmentsStoreGetRow,
  attachmentsStoreGetRowIncludingDeleted,
  attachmentsStoreListByNote,
  attachmentsStorePutWire,
  attachmentsStoreRemapNoteId,
  attachmentsStoreSoftDelete,
} from '@features/notes/repository/attachmentsStore';
import { revokeAttachmentBlobUrl } from '@features/notes/api/attachmentsClient';

const NOTE_PULL_CONCURRENCY = 6;
const ATTACHMENT_PULL_CONCURRENCY = 4;
const notesMutationTails = new Map<string, Promise<void>>();

/** Serialize remote note mutations per user so create/sync/publish cannot race. */
export async function withNotesRemoteMutation<T>(fn: () => Promise<T>): Promise<T> {
  const userId = requireUserId();
  const previous = notesMutationTails.get(userId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  notesMutationTails.set(userId, current);
  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (notesMutationTails.get(userId) === current) notesMutationTails.delete(userId);
  }
}

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
    // Persist the mapping before follow-up calls so a retry updates this note
    // instead of issuing another create after a partial success.
    await setServerId('notes', entry.entityId, created.id, userId);
    await remoteEncryptNoteBody(created.id, encBody);
    const plain = await decryptNoteFromRemote({ ...created, encrypted: true });
    await notesStoreReplaceId(entry.entityId, plain);
    await attachmentsStoreRemapNoteId(entry.entityId, created.id, userId);
    return created.id;
  }

  const created = await remoteCreateNote(title, bodyMd, wikiLinks);
  await setServerId('notes', entry.entityId, created.id, userId);
  await notesStoreReplaceId(entry.entityId, created);
  await attachmentsStoreRemapNoteId(entry.entityId, created.id, userId);
  return created.id;
}

/** Create remote note + id_map when a local note has never been synced (e.g. publish). */
export async function ensureNoteServerId(localId: string): Promise<string | null> {
  return withNotesRemoteMutation(async () => {
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
  });
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

async function pushNotesOutboxLocked(entry: OutboxEntry): Promise<void> {
  const userId = requireUserId();

  if (entry.op === 'attachment_put') {
    await pushAttachmentPut(entry, userId);
    return;
  }
  if (entry.op === 'attachment_delete') {
    await pushAttachmentDelete(entry, userId);
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

  const payload = entry.payload as Record<string, unknown>;
  const title = requireOutboxString(payload, 'title', entry.id);
  const bodyMd = requireOutboxString(payload, 'bodyMd', entry.id);
  const wikiLinks = requireOutboxWikiLinks(payload, entry.id);
  const e2ee = shouldPushE2ee();

  if (isVaultEnabledSync() && !isVaultUnlocked()) {
    throw new SyncDeferredError('Vault locked — unlock in Settings to sync encrypted notes');
  }

  if (entry.op === 'create') {
    const serverId = await resolveNoteServerId(
      entry,
      userId,
      title,
      bodyMd,
      wikiLinks,
      e2ee,
    );
    if (!serverId) {
      await removeOutboxForEntity('notes', entry.entityId, 'create', userId);
      return;
    }

    const latestLocal = await notesStoreGetRow(entry.entityId, userId);
    if (!latestLocal?.deleted) {
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
    }
    await removeOutboxForEntity('notes', entry.entityId, 'create', userId);
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

async function pushAttachmentPut(entry: OutboxEntry, userId: string): Promise<void> {
  if (isVaultEnabledSync() && !isVaultUnlocked()) {
    throw new SyncDeferredError('Vault locked — unlock in Settings to sync encrypted notes');
  }
  const payload = entry.payload as Record<string, unknown>;
  const row = await attachmentsStoreGetRow(entry.entityId, userId);
  if (!row) {
    // Soft-deleted or missing — nothing to put.
    await removeOutbox(entry.id, userId);
    return;
  }
  const noteId =
    row.noteId ||
    (typeof payload.noteId === 'string' ? payload.noteId : '');
  if (!noteId) {
    throw new Error(`Invalid notes outbox payload: noteId (${entry.id})`);
  }
  const noteServerId = await getServerId('notes', noteId, userId);
  if (!noteServerId) {
    throw new SyncDeferredError(`Note not synced yet for attachment ${entry.entityId}`);
  }
  try {
    await remotePutAttachment(noteServerId, {
      id: entry.entityId,
      fileName: row.fileName,
      mime: row.mime,
      dataB64: row.dataB64,
      encrypted: row.atRestEncrypted,
    });
  } catch (err) {
    if (isRemoteNotFound(err)) {
      await removeOutbox(entry.id, userId);
      return;
    }
    throw err;
  }
  await removeOutbox(entry.id, userId);
}

async function pushAttachmentDelete(entry: OutboxEntry, userId: string): Promise<void> {
  const payload = entry.payload as Record<string, unknown>;
  const row = await attachmentsStoreGetRowIncludingDeleted(entry.entityId, userId);
  const noteId =
    row?.noteId ??
    (typeof payload.noteId === 'string' ? payload.noteId : null);
  if (!noteId) {
    throw new Error(`Invalid notes outbox payload: noteId (${entry.id})`);
  }
  const noteServerId = await getServerId('notes', noteId, userId);
  if (!noteServerId) {
    const noteRow = await notesStoreGetRow(noteId, userId);
    // Note never reached the server (or already tombstoned without id_map) —
    // nothing to delete remotely; drop the outbox entry.
    if (!noteRow || noteRow.deleted) {
      await removeOutbox(entry.id, userId);
      return;
    }
    throw new SyncDeferredError(`Note not synced yet for attachment delete ${entry.entityId}`);
  }
  try {
    await remoteDeleteAttachment(noteServerId, entry.entityId);
  } catch (err) {
    if (isRemoteNotFound(err)) {
      await removeOutbox(entry.id, userId);
      return;
    }
    throw err;
  }
  await removeOutbox(entry.id, userId);
}

async function pullAttachmentsForNote(localNoteId: string, serverNoteId: string, userId: string): Promise<void> {
  const remoteList = await remoteListAttachments(serverNoteId);
  const remoteIds = new Set(remoteList.map((a) => a.id));
  await mapPool(remoteList, ATTACHMENT_PULL_CONCURRENCY, async (meta) => {
    const local = await attachmentsStoreGetRowIncludingDeleted(meta.id, userId);
    if (local?.deleted) return;
    if (
      local &&
      local.noteId === localNoteId &&
      meta.updatedAt &&
      new Date(local.updatedAt).getTime() >= new Date(meta.updatedAt).getTime()
    ) {
      return;
    }
    const full = await remoteGetAttachment(serverNoteId, meta.id);
    await attachmentsStorePutWire({
      id: full.id,
      noteId: localNoteId,
      fileName: full.fileName,
      mime: full.mime,
      dataB64: full.dataB64,
      encrypted: full.encrypted,
      sizeBytes: full.sizeBytes,
      updatedAt: full.updatedAt ?? meta.updatedAt,
      userId,
    });
    revokeAttachmentBlobUrl(full.id);
  });
  const locals = await attachmentsStoreListByNote(localNoteId, userId);
  for (const local of locals) {
    if (remoteIds.has(local.id)) continue;
    if (await hasOutboxForEntity('notes', local.id, 'attachment_put', userId)) {
      continue;
    }
    await attachmentsStoreSoftDelete(local.id, userId);
    revokeAttachmentBlobUrl(local.id);
  }
}

export async function pushNotesOutbox(entry: OutboxEntry): Promise<void> {
  return withNotesRemoteMutation(() => pushNotesOutboxLocked(entry));
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
    } else {
      await notesStoreMergeRemote(noteToStored(wire, userId, false));
    }
    await pullAttachmentsForNote(s.id, s.id, userId);
  });

  const absentNoteIds = await notesStoreApplyRemoteAbsences(remoteIds, userId);
  for (const noteId of absentNoteIds) {
    const attIds = await attachmentsStoreDeleteForNote(noteId, userId);
    for (const attId of attIds) {
      revokeAttachmentBlobUrl(attId);
      await removeOutboxForEntity('notes', attId, undefined, userId);
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
    const serverId = await resolveEntityId('notes', row.id, userId);
    await pushEncryptedNote(serverId, plain.title, plain.bodyMd, row.wikiLinks ?? []);
  }
}
