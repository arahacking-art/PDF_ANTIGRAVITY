/**
 * thumbnailCache.ts
 * Caches PDF page thumbnails in IndexedDB keyed by file hash.
 * This allows instant thumbnail loading when the same PDF is re-opened.
 */

const DB_NAME = 'pdf-antigravity-cache';
const DB_VERSION = 1;
const STORE_NAME = 'thumbnails';
// Las miniaturas muestran el contenido de documentos posiblemente confidenciales:
// se guardan poco tiempo y se borran al cerrar el documento (ver clearThumbnailCache).
const CACHE_TTL_HOURS = 24;
const CACHE_TTL_MS = CACHE_TTL_HOURS * 60 * 60 * 1000;

interface CacheEntry {
  hash: string;
  thumbnails: string[]; // Array of dataURL strings
  timestamp: number;
  pageCount: number;
}

/**
 * Conexión única y reutilizada a la base de datos. Antes cada consulta abría una
 * conexión nueva y nunca la cerraba: se acumulaban y bloqueaban borrados/actualizaciones
 * de la base, haciendo que la siguiente consulta tardara segundos.
 */
let dbPromise: Promise<IDBDatabase> | null = null;

async function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'hash' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      // Si otra pestaña necesita borrar o actualizar la base, se cede la conexión
      db.onversionchange = () => { db.close(); dbPromise = null; };
      db.onclose = () => { dbPromise = null; };
      resolve(db);
    };
    request.onerror = () => { dbPromise = null; reject(request.error); };
  });
  return dbPromise;
}

/**
 * SHA-256 del archivo completo, como clave del caché.
 * Antes solo se usaban los primeros y últimos 32 KB más el tamaño: dos versiones de un
 * documento que difieren en el centro (p. ej. tras censurar) podían compartir clave y
 * mostrar las miniaturas de la otra. WebCrypto procesa 100 MB en una fracción de segundo.
 */
export async function computeFileHash(arrayBuffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
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
        if (ageMs > CACHE_TTL_MS) { resolve(null); return; }

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
 * Removes cache entries older than CACHE_TTL_HOURS.
 * Call this periodically (e.g., on app startup).
 */
export async function clearExpiredCache(): Promise<void> {
  try {
    const db = await openDB();
    const cutoff = Date.now() - CACHE_TTL_MS;

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

/**
 * Elimina del caché las miniaturas de un documento concreto.
 * Se usa tras censurar: las miniaturas del original mostrarían el contenido censurado.
 */
export async function removeCachedThumbnails(arrayBuffer: ArrayBuffer): Promise<void> {
  try {
    const hash = await computeFileHash(arrayBuffer);
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(hash);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve(); // Fail silently
    });
  } catch {
    // IndexedDB not available — nothing cached
  }
}

/** Borra todas las miniaturas guardadas (al cerrar el documento). */
export async function clearThumbnailCache(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve(); // Fail silently
    });
  } catch {
    // IndexedDB no disponible
  }
}
