/**
 * §2.1 — IndexedDB offline scan queue.
 * Zero dependencies. Stores scans when offline, drains on reconnect.
 */

const DB_NAME = 'stockyard-offline';
const STORE = 'pending-scans';
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'clientScanId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueueScan(scan) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).add(scan);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingScans() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getPendingCount() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function clearPendingScans() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function removeScan(clientScanId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(clientScanId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Drain the queue with exponential backoff retry.
 * Item 9: Per-scan sync tracking — only remove scans confirmed synced by server.
 * @param {Function} bulkSyncFn - async function that sends scans to server, returns { results: [...] }
 * @returns {{ synced: number, failed: number }}
 */
export async function drainQueue(bulkSyncFn, maxRetries = 3) {
  const pending = await getPendingScans();
  if (!pending.length) return { synced: 0, failed: 0 };

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await bulkSyncFn(pending);
      // Per-scan: remove only those that the server accepted or already processed
      const results = response?.results || [];
      let synced = 0;
      let failed = 0;
      for (const r of results) {
        if (r.status === 'accepted' || r.status === 'already_processed' || r.status === 'rejected') {
          await removeScan(r.client_scan_id);
          synced++;
        } else {
          failed++;
        }
      }
      // If server returned no results array, fall back to clearing all (legacy compat)
      if (!results.length && pending.length) {
        await clearPendingScans();
        return { synced: pending.length, failed: 0 };
      }
      return { synced, failed };
    } catch (err) {
      if (attempt === maxRetries - 1) {
        console.error('[offline-queue] Failed after retries:', err);
        return { synced: 0, failed: pending.length };
      }
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
    }
  }
  return { synced: 0, failed: pending.length };
}
