import { dbDelete, dbGetAllByUser, dbPut, requireUserId } from '@shared/db/nordlyDb';

import type { OutboxEntry, OutboxOp, SyncDomain } from './types';

type OutboxRow = OutboxEntry & { key: string };

function rowKey(userId: string, id: string): string {
  return `${userId}::outbox::${id}`;
}

const entityMutationTails = new Map<string, Promise<void>>();

async function serializeEntityMutation<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = entityMutationTails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  entityMutationTails.set(key, current);
  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (entityMutationTails.get(key) === current) entityMutationTails.delete(key);
  }
}

export async function enqueueOutbox(
  domain: SyncDomain,
  op: OutboxOp,
  entityId: string,
  payload: unknown,
  serverId?: string,
): Promise<void> {
  const userId = requireUserId();
  const id = crypto.randomUUID();
  const entry: OutboxRow = {
    key: rowKey(userId, id),
    id,
    userId,
    domain,
    op,
    entityId,
    serverId,
    payload,
    createdAt: Date.now(),
    attempts: 0,
  };
  await dbPut('outbox', entry);
}

/** In-process idempotent enqueue for reconciliation and repeated UI actions. */
export async function enqueueOutboxOnce(
  domain: SyncDomain,
  op: OutboxOp,
  entityId: string,
  payload: unknown,
  serverId?: string,
): Promise<boolean> {
  const userId = requireUserId();
  const lockKey = `${userId}:${domain}:${entityId}:${op}`;
  return serializeEntityMutation(lockKey, async () => {
    if (await hasOutboxForEntity(domain, entityId, op, userId)) return false;
    await enqueueOutbox(domain, op, entityId, payload, serverId);
    return true;
  });
}

export async function listOutbox(userId?: string): Promise<OutboxEntry[]> {
  const uid = userId ?? requireUserId();
  const rows = await dbGetAllByUser<OutboxRow>('outbox', uid);
  return rows.sort((a, b) => a.createdAt - b.createdAt);
}

export async function removeOutbox(id: string, userId?: string): Promise<void> {
  const uid = userId ?? requireUserId();
  await dbDelete('outbox', rowKey(uid, id));
}

export async function bumpOutboxAttempts(entry: OutboxEntry): Promise<number> {
  const nextAttempts = entry.attempts + 1;
  const row: OutboxRow = {
    ...entry,
    key: rowKey(entry.userId, entry.id),
    attempts: nextAttempts,
  };
  await dbPut('outbox', row);
  return nextAttempts;
}

export async function resetOutboxAttempts(userId?: string): Promise<number> {
  const uid = userId ?? requireUserId();
  const rows = await dbGetAllByUser<OutboxRow>('outbox', uid);
  let reset = 0;
  for (const row of rows) {
    if (row.attempts > 0) {
      await dbPut('outbox', { ...row, attempts: 0 });
      reset++;
    }
  }
  return reset;
}

export async function hasOutboxForEntity(
  domain: SyncDomain,
  entityId: string,
  op?: OutboxOp,
  userId?: string,
): Promise<boolean> {
  const rows = await listOutbox(userId);
  return rows.some((row) => row.domain === domain && row.entityId === entityId && (!op || row.op === op));
}

export async function outboxCount(userId?: string): Promise<number> {
  const rows = await listOutbox(userId);
  return rows.length;
}

export async function cancelOutboxForEntity(
  domain: SyncDomain,
  entityId: string,
  userId?: string,
): Promise<void> {
  const uid = userId ?? requireUserId();
  const rows = await listOutbox(uid);
  for (const row of rows) {
    if (row.domain === domain && row.entityId === entityId && row.op !== 'delete') {
      await removeOutbox(row.id, uid);
    }
  }
}

export async function removeOutboxForEntity(
  domain: SyncDomain,
  entityId: string,
  op?: OutboxOp,
  userId?: string,
): Promise<number> {
  const uid = userId ?? requireUserId();
  const rows = await listOutbox(uid);
  let removed = 0;
  for (const row of rows) {
    if (row.domain !== domain || row.entityId !== entityId || (op && row.op !== op)) continue;
    await removeOutbox(row.id, uid);
    removed += 1;
  }
  return removed;
}

export async function clearOutbox(userId: string): Promise<void> {
  const rows = await dbGetAllByUser<OutboxRow>('outbox', userId);
  for (const row of rows) await dbDelete('outbox', row.key);
}
