/* ============================================================================
   DFV — meme history store
   ----------------------------------------------------------------------------
   Every meme you download is kept in this browser using IndexedDB, so the
   gallery works with no server and nothing ever leaves your device. This is
   deliberately per-browser: clearing site data clears it, and it does not
   follow you to another machine.

   localStorage is unsuitable here — it caps out around 5 MB and only stores
   strings, while a single 1080x1080 PNG is often several hundred kilobytes.
   ========================================================================== */

'use strict';

const DB_NAME = 'dfv-memes';
const STORE = 'items';
const VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    let req;
    try { req = indexedDB.open(DB_NAME, VERSION); }
    catch (e) { reject(e); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        s.createIndex('createdAt', 'createdAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, mode) { return db.transaction(STORE, mode).objectStore(STORE); }

export async function saveMeme(blob, meta) {
  try {
    const db = await openDb();
    const store = tx(db, 'readwrite');
    store.add({ blob, createdAt: Date.now(), ...meta });
    return new Promise((res) => { db.transaction.oncomplete = res; setTimeout(res, 300); });
  } catch {
    return null;   // private mode, blocked storage — the download still worked
  }
}

export async function listMemes() {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const req = tx(db, 'readonly').getAll();
      req.onsuccess = () => resolve(req.result.sort((a, b) => b.createdAt - a.createdAt));
      req.onerror = () => reject(req.error);
    });
  } catch { return []; }
}

export async function deleteMeme(id) {
  const db = await openDb();
  tx(db, 'readwrite').delete(id);
}

export async function clearMemes() {
  const db = await openDb();
  tx(db, 'readwrite').clear();
}
