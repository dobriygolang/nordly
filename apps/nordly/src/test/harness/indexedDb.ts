const DEFAULT_DATABASES = ['nordly-db'];

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

async function clearDatabase(name: string): Promise<void> {
  const database = await requestResult(indexedDB.open(name));
  const stores = [...database.objectStoreNames];
  if (stores.length === 0) {
    database.close();
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(stores, 'readwrite');
    for (const store of stores) transaction.objectStore(store).clear();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error(`Failed to clear IndexedDB database ${name}`));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error(`Clearing IndexedDB database ${name} was aborted`));
  });
  database.close();
}

/**
 * Clears fake IndexedDB state without replacing the global factory, so modules
 * that cache an open connection continue to use the same isolated database.
 */
export async function resetFakeIndexedDb(databaseNames = DEFAULT_DATABASES): Promise<void> {
  await Promise.all(databaseNames.map(clearDatabase));
}
