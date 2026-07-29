/**
 * thumbnailCache.ts
 * Caches PDF page thumbnails in IndexedDB keyed by file hash.
 * This allows instant thumbnail loading when the same PDF is re-opened.
 */

const DB_NAME = 'pdf-antigravity-cache';
const DB_VERSION = 1;
const STORE_NAME = 'thumbnails';
const CACHE_TTL_DAYS = 7;

interface CacheEntry {
  hash: string;
  thumbnails: string[]; // Array of dataURL strings
  timestamp: number;
  pageCount: number;
}

/**
 * Opens (or creates) the IndexedDB database.
 */
async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'hash' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Computes a fast hash from the first 64KB of the file.
 * SHA-256 over a sample is good enough for cache keying.
 */
export async function computeFileHash(arrayBuffer: ArrayBuffer): Promise<string> {
  // Sample: first 32KB + last 32KB (catches both header and content changes)
  const totalBytes = arrayBuffer.byteLength;
  const sampleSize = Math.min(32768, Math.floor(totalBytes / 2));

  const combined = new Uint8Array(sampleSize * 2 + 8);
  // Include file size as part of the hash to distinguish files with same start
  const sizeView = new DataView(combined.buffer, 0, 8);
  sizeView.setBigUint64(0, BigInt(totalBytes), false);

  combined.set(new Uint8Array(arrayBuffer, 0, sampleSize), 8);
  if (totalBytes > sampleSize) {
    combined.set(new Uint8Array(arrayBuffer, totalBytes - sampleSize, sampleSize), 8 + sampleSize);
  }

  const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Retrieves cached thumbnails for a given file hash.
 * Returns null if not found or if cache is expired.
 */
export async function getCachedThumbnails(
  hash: string,
  expectedPageCount: number
): Promise<string[] | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(hash);

      request.onsuccess = () => {
        const entry: CacheEntry | undefined = request.result;
        if (!entry) { resolve(null); return; }

        // Check TTL
        const ageMs = Date.now() - entry.timestamp;
        const maxAgeMs = CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
        if (ageMs > maxAgeMs) { resolve(null); return; }

        // Verify page count matches (file might have been edited)
        if (entry.pageCount !== expectedPageCount) { resolve(null); return; }

        resolve(entry.thumbnails);
      };

      request.onerror = () => resolve(null);
    });
  } catch {
    return null; // IndexedDB not available (private mode, etc.)
  }
}

/**
 * Saves thumbnails to the IndexedDB cache.
 */
export async function saveThumbnailsToCache(
  hash: string,
  thumbnails: string[]
): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      const entry: CacheEntry = {
        hash,
        thumbnails,
        timestamp: Date.now(),
        pageCount: thumbnails.length,
      };

      store.put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve(); // Fail silently
    });
  } catch {
    // IndexedDB not available — fail silently
  }
}

/**
 * Removes cache entries older than TTL_DAYS.
 * Call this periodically (e.g., on app startup).
 */
export async function clearExpiredCache(): Promise<void> {
  try {
    const db = await openDB();
    const maxAgeMs = CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - maxAgeMs;

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('timestamp');
      const range = IDBKeyRange.upperBound(cutoff);
      const request = index.openCursor(range);

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Fail silently
  }
}
