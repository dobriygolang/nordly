import { isVaultEnabledSync } from '@shared/crypto/vaultPrefs';
import { requireUserId } from '@shared/db/nordlyDb';
import { isMissingVaultNote, isVaultRelPath } from '@features/notes/lib/vaultPath';
import { setVaultRootMissing } from '@features/notes/lib/notesSyncConsent';
import {
  planVaultReconcile,
  type LocalFile,
  type RemoteNote,
} from '@features/notes/lib/vaultReconcilePlan';
import {
  deleteVaultSyncIndex,
  listVaultSyncIndex,
  putVaultSyncIndex,
} from '@features/notes/repository/vaultSyncIndexStore';
import { decryptNoteFromRemote } from '@features/notes/crypto/noteCrypto';
import { remoteDeleteNote, remoteGetNote, remoteListNotes } from '@features/notes/remote/notesRemote';
import {
  vaultListNotes,
  vaultReadNote,
  vaultTrashNote,
  vaultWriteNote,
} from '@features/notes/vault/ipc';
import { enqueueVaultFilePut, suppressVaultWatch } from '@features/notes/vault/vaultOutbox';

export async function hashVaultText(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function stamp(updatedAt: Date | null, serverId: string): string {
  if (!updatedAt) throw new Error(`vault reconcile: remote note ${serverId} has no updatedAt`);
  return updatedAt.toISOString();
}

function conflictPath(path: string, day: string): string {
  const slash = path.lastIndexOf('/');
  const dir = slash === -1 ? '' : path.slice(0, slash + 1);
  const name = slash === -1 ? path : path.slice(slash + 1);
  const stem = name.replace(/\.md$/i, '');
  return `${dir}${stem} (конфликт ${day}).md`;
}

function unusedConflictPath(path: string, day: string, taken: Set<string>): string {
  let candidate = conflictPath(path, day);
  if (!taken.has(candidate)) return claimConflictPath(candidate, taken);
  const slash = candidate.lastIndexOf('/');
  const dir = slash === -1 ? '' : candidate.slice(0, slash + 1);
  const stem = (slash === -1 ? candidate : candidate.slice(slash + 1)).replace(/\.md$/i, '');
  for (let n = 2; n < 100; n += 1) {
    candidate = `${dir}${stem} ${n}.md`;
    if (!taken.has(candidate)) return claimConflictPath(candidate, taken);
  }
  throw new Error('vault reconcile: conflict path is exhausted');
}

function claimConflictPath(path: string, taken: Set<string>): string {
  if (!isVaultRelPath(path)) throw new Error('vault reconcile: conflict path is invalid');
  taken.add(path);
  return path;
}

export async function reconcileVault(): Promise<void> {
  const userId = requireUserId();
  const listed = await vaultListNotes();
  const index = await listVaultSyncIndex(userId);
  if (listed.length === 0 && index.length > 0) {
    setVaultRootMissing(true);
    return;
  }
  setVaultRootMissing(false);

  const local: LocalFile[] = [];
  for (const meta of listed) {
    if (!isVaultRelPath(meta.path)) continue;
    const content = await vaultReadNote(meta.path);
    local.push({ path: meta.path, hash: await hashVaultText(content.bodyMd) });
  }
  const localHash = new Map(local.map((file) => [file.path, file.hash]));
  const takenPaths = new Set(local.map((file) => file.path));
  const indexByServer = new Map(index.map((entry) => [entry.serverId, entry]));
  const summaries = await remoteListNotes();
  const remote: RemoteNote[] = [];
  const bodies = new Map<string, string>();
  for (const summary of summaries) {
    const known = indexByServer.get(summary.id);
    if (known && known.remoteUpdatedAt === stamp(summary.updatedAt, summary.id)) {
      remote.push({
        serverId: summary.id,
        path: known.path,
        updatedAt: known.remoteUpdatedAt,
        hash: known.hash,
      });
      continue;
    }
    const wire = await remoteGetNote(summary.id);
    if (isVaultEnabledSync() && !wire.encrypted) {
      throw new Error('notes_sync_plaintext_while_encrypted');
    }
    const plain = wire.encrypted ? await decryptNoteFromRemote(wire) : wire;
    if (!isVaultRelPath(plain.title)) {
      if (wire.encrypted) throw new Error(`vault pull: remote path is not a markdown file (${wire.id})`);
      continue;
    }
    const updatedAt = stamp(wire.updatedAt, wire.id);
    bodies.set(bodyKey(wire.id, plain.title), plain.bodyMd);
    remote.push({
      serverId: wire.id,
      path: plain.title,
      updatedAt,
      hash: await hashVaultText(plain.bodyMd),
    });
  }

  const remoteByKey = new Map(remote.map((note) => [bodyKey(note.serverId, note.path), note]));
  const plan = planVaultReconcile(local, index, remote);
  if (!plan.ok) {
    setVaultRootMissing(true);
    return;
  }

  for (const action of plan.actions) {
    switch (action.op) {
      case 'push_put':
        await enqueueLocal(action.path);
        break;
      case 'push_delete':
        await remoteDeleteNote(action.serverId);
        await deleteVaultSyncIndex(userId, action.path);
        break;
      case 'pull_write':
        await writeRemote(userId, action.path, action.serverId, remoteByKey, bodies, localHash);
        break;
      case 'pull_trash':
        suppressVaultWatch();
        await vaultTrashNote(action.path);
        await deleteVaultSyncIndex(userId, action.path);
        break;
      case 'conflict_copy':
        await copyConflict(userId, action.path, action.serverId, remoteByKey, localHash, bodies, takenPaths);
        break;
      case 'index_only':
        await putVaultSyncIndex({ ...action.entry, userId });
        break;
      case 'index_drop':
        await deleteVaultSyncIndex(userId, action.path);
        break;
    }
  }
}

function bodyKey(serverId: string, path: string): string {
  return `${serverId}\0${path}`;
}

function requireBody(bodies: Map<string, string>, serverId: string, path: string): string {
  const bodyMd = bodies.get(bodyKey(serverId, path));
  if (bodyMd === undefined) throw new Error(`vault reconcile: missing remote body ${serverId}`);
  return bodyMd;
}

async function enqueueLocal(path: string): Promise<void> {
  const content = await vaultReadNote(path);
  await enqueueVaultFilePut(path, content.bodyMd, 'md', content.updatedAtMs);
}

function requireRemote(
  remoteByKey: Map<string, RemoteNote>,
  serverId: string,
  path: string,
): RemoteNote {
  const note = remoteByKey.get(bodyKey(serverId, path));
  if (!note) throw new Error(`vault reconcile: missing remote note ${serverId}`);
  return note;
}

async function writeRemote(
  userId: string,
  path: string,
  serverId: string,
  remoteByKey: Map<string, RemoteNote>,
  bodies: Map<string, string>,
  localHash: Map<string, string>,
): Promise<void> {
  const note = requireRemote(remoteByKey, serverId, path);
  if (await localChangedSinceSnapshot(path, localHash)) return;
  const bodyMd = requireBody(bodies, serverId, path);
  suppressVaultWatch();
  await vaultWriteNote(path, bodyMd);
  await putVaultSyncIndex({
    userId,
    path,
    serverId,
    hash: note.hash,
    remoteUpdatedAt: note.updatedAt,
  });
}

async function localChangedSinceSnapshot(path: string, localHash: Map<string, string>): Promise<boolean> {
  const snapshot = localHash.get(path);
  if (snapshot === undefined) return false;
  try {
    const current = await vaultReadNote(path);
    return (await hashVaultText(current.bodyMd)) !== snapshot;
  } catch (err) {
    if (isMissingVaultNote(err)) return false;
    throw err;
  }
}

async function copyConflict(
  userId: string,
  path: string,
  serverId: string,
  remoteByKey: Map<string, RemoteNote>,
  localHash: Map<string, string>,
  bodies: Map<string, string>,
  takenPaths: Set<string>,
): Promise<void> {
  const note = requireRemote(remoteByKey, serverId, path);
  const bodyMd = requireBody(bodies, serverId, path);
  const day = note.updatedAt.slice(0, 10);
  const copyPath = unusedConflictPath(path, day, takenPaths);
  const hash = localHash.get(path);
  if (!hash) throw new Error(`vault reconcile: missing local hash ${path}`);
  const mtime = Date.parse(note.updatedAt);
  if (!Number.isFinite(mtime)) throw new Error(`vault reconcile: bad remote time ${serverId}`);
  suppressVaultWatch();
  await vaultWriteNote(copyPath, bodyMd);
  await enqueueVaultFilePut(copyPath, bodyMd, 'md', mtime);
  await enqueueLocal(path);
  await putVaultSyncIndex({
    userId,
    path,
    serverId,
    hash,
    remoteUpdatedAt: note.updatedAt,
  });
}
