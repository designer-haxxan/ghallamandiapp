// IndexedDB layer. Every money action writes its records and ledger entries in ONE transaction,
// so a failure never leaves a bill without its ledger entries (or the reverse).
export const DB_NAME = 'ghallamandi_app';
export const DB_VERSION = 1;

const STORES = {
  meta: { key: 'key', indexes: {} },
  parties: { key: 'id', indexes: { type: 'type' } },
  commodities: { key: 'id', indexes: {} },
  lots: { key: 'id', indexes: { number: ['number', true], farmerId: 'farmerId', date: 'date' } },
  sales: { key: 'id', indexes: { number: ['number', true], buyerId: 'buyerId', date: 'date' } },
  ledger: { key: 'id', indexes: { partyId: 'partyId', refId: 'refId', date: 'date' } },
  expenses: { key: 'id', indexes: { date: 'date', lotId: 'lotId' } },
  rates: { key: 'id', indexes: { date: 'date' } },
  audit: { key: 'id', indexes: { at: 'at' } },
};
export const STORE_NAMES = Object.keys(STORES);

let dbp = null;

export function openDB() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB is not supported in this browser.'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, def] of Object.entries(STORES)) {
        if (db.objectStoreNames.contains(name)) continue;
        const os = db.createObjectStore(name, { keyPath: def.key });
        for (const [idx, spec] of Object.entries(def.indexes)) {
          const [kp, unique] = Array.isArray(spec) ? spec : [spec, false];
          os.createIndex(idx, kp, { unique: !!unique });
        }
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); dbp = null; };
      resolve(db);
    };
    req.onerror = () => { dbp = null; reject(req.error); };
    req.onblocked = () => reject(new Error('Close other tabs of this app and reload.'));
  });
  return dbp;
}

const req2p = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

// Transaction helper. Inside fn, only IDB requests may be awaited (awaiting anything else lets the transaction close).
export async function tx(stores, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    let t;
    try { t = db.transaction(stores, mode); } catch (e) { return reject(e); }
    let result;
    let failure = null;
    t.oncomplete = () => resolve(result);
    t.onerror = () => { failure = failure || t.error; };
    t.onabort = () => reject(failure || t.error || new Error('Transaction aborted'));
    const api = {
      get: (s, k) => req2p(t.objectStore(s).get(k)),
      getAll: (s) => req2p(t.objectStore(s).getAll()),
      byIndex: (s, idx, k) => req2p(t.objectStore(s).index(idx).getAll(k)),
      put: (s, v) => req2p(t.objectStore(s).put(v)),
      del: (s, k) => req2p(t.objectStore(s).delete(k)),
      clear: (s) => req2p(t.objectStore(s).clear()),
    };
    Promise.resolve().then(() => fn(api)).then((r) => { result = r; }, (err) => {
      failure = err;
      try { t.abort(); } catch { /* already finished */ }
    });
  });
}

export const read = (stores, fn) => tx(stores, 'readonly', fn);
export const write = (stores, fn) => tx(stores, 'readwrite', fn);

export const getAll = (store) => read([store], (t) => t.getAll(store));
export const getOne = (store, key) => read([store], (t) => t.get(store, key));
export async function putOne(store, value) { return write([store], (t) => t.put(store, value)); }

// Erase everything (used by "Erase all data" and by restore in replace mode).
export async function clearAll() {
  return write(STORE_NAMES, async (t) => { for (const s of STORE_NAMES) await t.clear(s); });
}
