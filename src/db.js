// IndexedDB persistence. Directory/file handles from the File System Access API
// are structured-cloneable in Chromium, so the library survives reloads with
// re-grantable read permission.

const DB_NAME = 'isolation';
const DB_VERSION = 1;

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('albums')) db.createObjectStore('albums', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('playlists')) db.createObjectStore('playlists', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(db, store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const out = fn(s);
    t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : undefined);
    t.onerror = () => reject(t.error);
  });
}

export async function getAll(store) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store).objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function put(store, value) {
  const db = await open();
  return tx(db, store, 'readwrite', (s) => s.put(value));
}

export async function del(store, key) {
  const db = await open();
  return tx(db, store, 'readwrite', (s) => s.delete(key));
}

export async function clear(store) {
  const db = await open();
  return tx(db, store, 'readwrite', (s) => s.clear());
}

export async function kvGet(key) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction('kv').objectStore('kv').get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function kvSet(key, value) {
  const db = await open();
  return tx(db, 'kv', 'readwrite', (s) => s.put(value, key));
}
