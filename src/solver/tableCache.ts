/**
 * IndexedDB cache for solver tables. Keys carry a version so a change to the
 * table layout never reads stale data; bump TABLE_VERSION when pdb.ts changes.
 */
const DB = 'cube-solver-tables';
const STORE = 'tables';
export const TABLE_VERSION = 1;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const key = (name: string) => `v${TABLE_VERSION}:${name}`;

export async function loadTables(names: string[]): Promise<Uint8Array[] | null> {
  if (typeof indexedDB === 'undefined') return null;
  const db = await open();
  const tx = db.transaction(STORE, 'readonly');
  const store = tx.objectStore(STORE);
  const out = await Promise.all(names.map((n) => new Promise<Uint8Array | undefined>((res, rej) => {
    const r = store.get(key(n));
    r.onsuccess = () => res(r.result as Uint8Array | undefined);
    r.onerror = () => rej(r.error);
  })));
  db.close();
  return out.every((t) => t instanceof Uint8Array) ? (out as Uint8Array[]) : null;
}

export async function saveTables(names: string[], tables: Uint8Array[]): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await open();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    names.forEach((n, i) => tx.objectStore(STORE).put(tables[i], key(n)));
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  db.close();
}
