/** Rewrite all IndexedDB rows from one userId scope to another (local → cloud login). */

import { openDb, type NordlyStore } from '@shared/db/nordlyDb';

const STORES: NordlyStore[] = [
  'notes',
  'tasks',
  'focus_sessions',
  'whiteboards',
  'outbox',
  'meta',
  'id_map',
  'calendar_events',
  'note_attachments',
];

type Row = Record<string, unknown> & { key: string; userId?: string };

function rewriteKey(key: string, fromUserId: string, toUserId: string): string {
  const prefix = `${fromUserId}::`;
  if (!key.startsWith(prefix)) {
    throw new Error(`rebindUserId: unexpected key "${key}" for user ${fromUserId}`);
  }
  return `${toUserId}::${key.slice(prefix.length)}`;
}

function ownsRow(row: Row, userId: string): boolean {
  return row.userId === userId || (typeof row.key === 'string' && row.key.startsWith(`${userId}::`));
}

function rowUpdatedAt(row: Row): number {
  const v = row.updatedAt;
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** Prefer incoming (local offline) unless existing is strictly newer. */
function preferIncoming(incoming: Row, existing: Row): boolean {
  return rowUpdatedAt(incoming) >= rowUpdatedAt(existing);
}

async function readStoreRows(storeName: NordlyStore): Promise<Row[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve((req.result ?? []) as Row[]);
    req.onerror = () => reject(req.error ?? new Error('IDB getAll failed'));
  });
}

/**
 * Move every row owned by `fromUserId` into `toUserId` (new composite keys).
 * No-op when ids match. If the target already has rows, merge: non-colliding
 * keys stay; on key collision keep the newer `updatedAt` (ties prefer local/from).
 */
export async function rebindDbUserId(fromUserId: string, toUserId: string): Promise<void> {
  if (fromUserId === toUserId) return;
  if (!fromUserId || !toUserId) {
    throw new Error('rebindDbUserId: from and to user ids are required');
  }

  const ownedByStore = new Map<NordlyStore, Row[]>();
  const targetByKey = new Map<NordlyStore, Map<string, Row>>();
  for (const name of STORES) {
    const rows = await readStoreRows(name);
    ownedByStore.set(
      name,
      rows.filter((row) => ownsRow(row, fromUserId)),
    );
    const map = new Map<string, Row>();
    for (const row of rows) {
      if (ownsRow(row, toUserId)) map.set(row.key, row);
    }
    targetByKey.set(name, map);
  }

  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORES, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IDB rebind failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IDB rebind aborted'));

    for (const name of STORES) {
      const store = tx.objectStore(name);
      const owned = ownedByStore.get(name) ?? [];
      const existingKeys = targetByKey.get(name) ?? new Map();
      for (const row of owned) {
        const nextKey = rewriteKey(row.key, fromUserId, toUserId);
        const incoming = { ...row, key: nextKey, userId: toUserId };
        const existing = existingKeys.get(nextKey);
        store.delete(row.key);
        if (!existing || preferIncoming(incoming, existing)) {
          store.put(incoming);
        }
      }
    }
  });
}
