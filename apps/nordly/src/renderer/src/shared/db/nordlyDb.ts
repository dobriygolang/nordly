/** IndexedDB — local-first store scoped by userId. */

const DB_NAME = 'nordly-db';
const LEGACY_DB_NAME = 'hone-db';
const DB_VERSION = 2;
const MIGRATION_META_KEY = '__global__::migrated_from_hone_db';

const STORES = ['notes', 'tasks', 'focus_sessions', 'whiteboards', 'outbox', 'meta', 'id_map'] as const;
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

export function getDbUserId(): string | null {
  return currentUserId;
}

function requireUserId(): string {
  if (!currentUserId) throw new Error('nordlyDb: userId not set');
  return currentUserId;
}

function scopedKey(userId: string, id: string): string {
  return `${userId}::${id}`;
}

function openLegacyDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    const req = indexedDB.open(LEGACY_DB_NAME);
    req.onerror = () => resolve(null);
    req.onsuccess = () => resolve(req.result);
  });
}

async function migrateFromLegacyDb(db: IDBDatabase): Promise<void> {
  const already = await new Promise<boolean>((resolve, reject) => {
    const tx = db.transaction('meta', 'readonly');
    const req = tx.objectStore('meta').get(MIGRATION_META_KEY);
    req.onsuccess = () => resolve(Boolean((req.result as { value?: boolean } | undefined)?.value));
    req.onerror = () => reject(req.error ?? new Error('IDB migration meta read failed'));
  }).catch(() => false);
  if (already) return;

  const legacy = await openLegacyDb();
  if (!legacy) {
    await writeMigrationFlag(db);
    return;
  }

  for (const storeName of STORES) {
    if (!legacy.objectStoreNames.contains(storeName) || !db.objectStoreNames.contains(storeName)) {
      continue;
    }
    const rows = await new Promise<unknown[]>((resolve, reject) => {
      const tx = legacy.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve((req.result as unknown[]) ?? []);
      req.onerror = () => reject(req.error ?? new Error('IDB legacy read failed'));
    });
    if (rows.length === 0) continue;

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const os = tx.objectStore(storeName);
      for (const row of rows) os.put(row as never);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IDB migration write failed'));
    });
  }

  legacy.close();
  await writeMigrationFlag(db);
}

function writeMigrationFlag(db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('meta', 'readwrite');
    tx.objectStore('meta').put({
      key: MIGRATION_META_KEY,
      userId: '__global__',
      value: true,
      updatedAt: Date.now(),
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IDB migration meta write failed'));
  });
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('IDB open failed'));
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          const store = db.createObjectStore(name, { keyPath: 'key' });
          if (name !== 'meta' && name !== 'id_map') {
            store.createIndex('userId', 'userId', { unique: false });
          }
        }
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      void migrateFromLegacyDb(db)
        .then(() => resolve(db))
        .catch(reject);
    };
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

export async function dbClearUser(store: NordlyStore, userId: string): Promise<void> {
  const rows = await dbGetAllByUser<{ key: string; userId: string }>(store, userId);
  await openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        const os = tx.objectStore(store);
        for (const row of rows) os.delete(row.key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }),
  );
}

export function entityKey(id: string, userId?: string): string {
  return scopedKey(userId ?? requireUserId(), id);
}

export { scopedKey, requireUserId, openDb };
