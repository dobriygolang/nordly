/** IndexedDB — local-first store scoped by userId. */

const DB_NAME = 'nordly-db';
const DB_VERSION = 7;

const STORES = [
  'notes',
  'tasks',
  'focus_sessions',
  'whiteboards',
  'outbox',
  'meta',
  'id_map',
  'calendar_events',
  'note_attachments',
  'vault_sync_index',
  'card_reviews',
] as const;
export type NordlyStore = (typeof STORES)[number];

export interface ScopedRecord {
  userId: string;
  id: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;
let currentUserId: string | null = null;

export function setDbUserId(userId: string | null): void {
  currentUserId = userId;
}

function resolveUserId(): string | null {
  return currentUserId;
}

function requireUserId(): string {
  const uid = resolveUserId();
  if (!uid) throw new Error('nordlyDb: userId not set');
  return uid;
}

function scopedKey(userId: string, id: string): string {
  return `${userId}::${id}`;
}

function deleteVaultLegacyRows(tx: IDBTransaction, storeName: 'id_map' | 'outbox'): void {
  if (!tx.db.objectStoreNames.contains(storeName)) return;
  const store = tx.objectStore(storeName);
  const request = store.openCursor();
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) return;
    const row = cursor.value as { domain?: unknown };
    if (row.domain === 'vault') cursor.delete();
    cursor.continue();
  };
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('IDB open failed'));
    req.onupgradeneeded = (event) => {
      const db = req.result;
      const tx = req.transaction;
      const oldVersion = event.oldVersion;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          const store = db.createObjectStore(name, { keyPath: 'key' });
          if (name !== 'meta' && name !== 'id_map') {
            store.createIndex('userId', 'userId', { unique: false });
          }
          if (name === 'note_attachments') {
            store.createIndex('userId_noteId', ['userId', 'noteId'], { unique: false });
          }
        } else if (name === 'note_attachments' && tx) {
          const store = tx.objectStore(name);
          if (!store.indexNames.contains('userId_noteId')) {
            store.createIndex('userId_noteId', ['userId', 'noteId'], { unique: false });
          }
        }
      }
      if (oldVersion > 0 && oldVersion < 6 && tx) {
        deleteVaultLegacyRows(tx, 'id_map');
        deleteVaultLegacyRows(tx, 'outbox');
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
  return dbPromise;
}

function runTx<T>(
  store: NordlyStore,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const os = tx.objectStore(store);
        const req = fn(os);
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error ?? new Error('IDB request failed'));
        tx.onerror = () => reject(tx.error ?? new Error('IDB tx failed'));
      }),
  );
}

export async function dbPut<T extends { key: string }>(store: NordlyStore, row: T): Promise<void> {
  await runTx(store, 'readwrite', (s) => s.put(row));
}

export async function dbPutMany<T extends { key: string }>(
  store: NordlyStore,
  rows: readonly T[],
): Promise<void> {
  if (rows.length === 0) return;
  await openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        const objectStore = tx.objectStore(store);
        for (const row of rows) objectStore.put(row);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('IDB batch put failed'));
        tx.onabort = () => reject(tx.error ?? new Error('IDB batch put aborted'));
      }),
  );
}

export async function dbGet<T>(store: NordlyStore, key: string): Promise<T | null> {
  const row = await runTx<T | undefined>(store, 'readonly', (s) => s.get(key));
  return row ?? null;
}

export async function dbDelete(store: NordlyStore, key: string): Promise<void> {
  await runTx(store, 'readwrite', (s) => s.delete(key));
}

export async function dbGetAllByUser<T extends { userId: string }>(
  store: NordlyStore,
  userId: string,
): Promise<T[]> {
  return runTx<T[]>(store, 'readonly', (s) => {
    const idx = s.index('userId');
    return idx.getAll(userId);
  });
}

export async function dbGetAllByIndex<T>(
  store: NordlyStore,
  indexName: string,
  query: IDBValidKey | IDBKeyRange,
): Promise<T[]> {
  return runTx<T[]>(store, 'readonly', (s) => {
    const idx = s.index(indexName);
    return idx.getAll(query);
  });
}

export function getDbUserId(): string | null {
  return resolveUserId();
}

export function entityKey(id: string, userId?: string): string {
  return scopedKey(userId ?? requireUserId(), id);
}

export { scopedKey, requireUserId, openDb };
