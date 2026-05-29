export const DB_NAME = 'hunttrack-db';
export const DB_VERSION = 1;
const STORES = ['waypoints', 'tracks', 'cachedAreas', 'syncLog'];

let dbPromise = null;

/** Open the IndexedDB database and create stores when needed. */
export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

/** Run a transaction for a store. */
async function tx(storeName, mode, callback) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    let result;
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
    result = callback(store);
  });
}

/** Save or update a record. */
export async function put(storeName, value) {
  return tx(storeName, 'readwrite', store => store.put(value));
}

/** Read a record by id. */
export async function get(storeName, id) {
  return tx(storeName, 'readonly', store => new Promise((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  }));
}

/** Read all records from a store. */
export async function getAll(storeName) {
  return tx(storeName, 'readonly', store => new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  }));
}

/** Delete a record by id. */
export async function remove(storeName, id) {
  return tx(storeName, 'readwrite', store => store.delete(id));
}

/** Clear a single store. */
export async function clearStore(storeName) {
  return tx(storeName, 'readwrite', store => store.clear());
}

/** Clear all app data. */
export async function clearAllData() {
  for (const store of STORES) await clearStore(store);
}

/** Return unsynced waypoints and tracks. */
export async function getPendingSync() {
  const waypoints = (await getAll('waypoints')).filter(item => item.synced === false || item.deleted === true);
  const tracks = (await getAll('tracks')).filter(item => item.synced === false || item.deleted === true);
  return { waypoints, tracks, count: waypoints.length + tracks.length };
}

/** Append an entry to the sync log. */
export async function addLog(message, level = 'info') {
  const entry = { id: crypto.randomUUID(), message, level, created_at: new Date().toISOString() };
  await put('syncLog', entry);
  return entry;
}

/** Merge remote records using last-write-wins on updated_at. */
export async function mergeRecords(storeName, remoteRecords) {
  const localRecords = await getAll(storeName);
  const localById = new Map(localRecords.map(item => [item.id, item]));
  for (const remote of remoteRecords) {
    const local = localById.get(remote.id);
    if (!local || new Date(remote.updated_at || remote.created_at) >= new Date(local.updated_at || local.created_at)) {
      await put(storeName, { ...remote, synced: true });
    }
  }
}
