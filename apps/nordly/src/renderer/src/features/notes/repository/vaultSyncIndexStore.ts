import { dbDelete, dbGet, dbGetAllByUser, dbPut } from '@shared/db/nordlyDb';

export interface VaultSyncIndexEntry {
  userId: string;
  path: string;
  serverId: string;
  hash: string;
  remoteUpdatedAt: string;
}

interface VaultSyncIndexRow extends VaultSyncIndexEntry {
  key: string;
}

function rowKey(userId: string, path: string): string {
  return `${userId}::${path}`;
}

export async function listVaultSyncIndex(userId: string): Promise<VaultSyncIndexEntry[]> {
  const rows = await dbGetAllByUser<VaultSyncIndexRow>('vault_sync_index', userId);
  return rows.map(({ userId: id, path, serverId, hash, remoteUpdatedAt }) => ({
    userId: id,
    path,
    serverId,
    hash,
    remoteUpdatedAt,
  }));
}

export async function getVaultSyncIndex(
  userId: string,
  path: string,
): Promise<VaultSyncIndexEntry | null> {
  const row = await dbGet<VaultSyncIndexRow>('vault_sync_index', rowKey(userId, path));
  if (!row) return null;
  return {
    userId: row.userId,
    path: row.path,
    serverId: row.serverId,
    hash: row.hash,
    remoteUpdatedAt: row.remoteUpdatedAt,
  };
}

export async function putVaultSyncIndex(entry: VaultSyncIndexEntry): Promise<void> {
  await dbPut('vault_sync_index', { ...entry, key: rowKey(entry.userId, entry.path) });
}

export async function deleteVaultSyncIndex(userId: string, path: string): Promise<void> {
  await dbDelete('vault_sync_index', rowKey(userId, path));
}
