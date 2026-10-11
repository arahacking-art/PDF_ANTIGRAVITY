import React, { createContext, useContext, useState, useCallback, useRef, useLayoutEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import {
  computeFileHash,
  getCachedThumbnails,
  saveThumbnailsToCache,
  clearExpiredCache,
} from '../utils/thumbnailCache';
import { openPdfDocument } from '../config/pdfjs';

export interface PdfPageInfo {
  index: number;       // 0-based
  width: number;       // original width in PDF points
  height: number;      // original height in PDF points
  thumbnailUrl: string; // low-res JPEG for sidebar thumbnails
}

interface PdfState {
  /** The raw File object currently loaded */
  file: File | null;
  /** The ArrayBuffer of the current file (for pdf-lib operations) */
  arrayBuffer: ArrayBuffer | null;
  /** The pdf.js document proxy (for rendering) */
  pdfDoc: pdfjsLib.PDFDocumentProxy | null;
  /** Metadata about each page */
  pageInfos: PdfPageInfo[];
  /** Total number of pages */
  numPages: number;
  /** File name for display */
  fileName: string;
  /** Whether the PDF is currently being loaded */
  isLoading: boolean;
  /** Loading progress 0-100 */
  loadProgress: number;
  /** Indicates if the PDF is password protected and cannot be rendered */
  isEncrypted?: boolean;
  /** Error message if PDF loading failed */
  error?: string | null;
}

interface PdfContextValue extends PdfState {
  /** Load a File into the workspace */
  loadFile: (file: File) => Promise<void>;
  /** Aplica un cambio al documento abierto (se puede deshacer). Conserva el nombre del archivo. */
  replaceWithBytes: (bytes: Uint8Array) => Promise<void>;
  /** Igual que replaceWithBytes, a partir de un Blob (p. ej. respuesta del backend) */
  replaceWithBlob: (blob: Blob) => Promise<void>;
  /** Clear the workspace (no file loaded) */
  clearFile: () => void;
  /** Vuelve a la versión anterior del documento */
  undo: () => Promise<void>;
  /** Rehace el último cambio deshecho */
  redo: () => Promise<void>;
  /** Marca la versión actual como guardada (descargada) */
  markSaved: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Hay cambios aplicados que aún no se han descargado */
  isDirty: boolean;
  /**
   * Identifica la sesión de edición: cambia al abrir o cerrar un archivo, pero no al
   * aplicar, deshacer o rehacer cambios (el visor lo usa para conservar la posición).
   */
  documentId: number;
}

interface HistoryEntry {
  arrayBuffer: ArrayBuffer;
  fileName: string;
  version: number;
}

// Límites del historial de deshacer: cada entrada es una copia completa del PDF.
const MAX_HISTORY_ENTRIES = 20;
const MAX_HISTORY_BYTES = 200 * 1024 * 1024;

/** Descarta las versiones más antiguas que excedan los límites (siempre conserva al menos una). */
function trimHistory(stack: HistoryEntry[]): void {
  let total = stack.reduce((sum, e) => sum + e.arrayBuffer.byteLength, 0);
  while (stack.length > MAX_HISTORY_ENTRIES || (stack.length > 1 && total > MAX_HISTORY_BYTES)) {
    total -= stack.shift()!.arrayBuffer.byteLength;
  }
}

const PdfContext = createContext<PdfContextValue | null>(null);

export function usePdfContext(): PdfContextValue {
  const ctx = useContext(PdfContext);
  if (!ctx) throw new Error('usePdfContext must be used within PdfProvider');
  return ctx;
}

/**
 * Generate low-res thumbnail for a single page
 */
async function generateThumbnail(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  pageNum: number,  // 1-based
  scale = 0.3
): Promise<{ url: string; width: number; height: number }> {
  const page = await pdfDoc.getPage(pageNum);
  const origVp = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(vp.width);
  canvas.height = Math.round(vp.height);
  const ctx = canvas.getContext('2d', { alpha: false })!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvasContext: ctx, canvas: canvas, viewport: vp }).promise;
  const url = canvas.toDataURL('image/jpeg', 0.6);
  page.cleanup();

  return { url, width: origVp.width, height: origVp.height };
}

export const PdfProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<PdfState>({
    file: null,
    arrayBuffer: null,
    pdfDoc: null,
    pageInfos: [],
    numPages: 0,
    fileName: '',
    isLoading: false,
    loadProgress: 0,
    isEncrypted: false,
    error: null,
  });

  // Keep a ref to the pdfDoc so we can destroy it on cleanup
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);

  // Estado más reciente, para leerlo desde callbacks sin closures obsoletos
  const stateRef = useRef(state);
  useLayoutEffect(() => { stateRef.current = state; });

  // ── Historial (deshacer / rehacer) ──────────────────────
  const undoRef = useRef<HistoryEntry[]>([]);
  const redoRef = useRef<HistoryEntry[]>([]);
  const versionCounterRef = useRef(0);
  const versionRef = useRef(0);       // versión del documento abierto
  const savedVersionRef = useRef(0);  // última versión descargada
  const busyRef = useRef(false);      // evita cambios simultáneos (p. ej. Ctrl+Z repetido)
  const [historyStatus, setHistoryStatus] = useState({ canUndo: false, canRedo: false, isDirty: false });
  const [documentId, setDocumentId] = useState(0);

  const syncHistoryStatus = useCallback(() => {
    setHistoryStatus({
      canUndo: undoRef.current.length > 0,
      canRedo: redoRef.current.length > 0,
      isDirty: versionRef.current !== savedVersionRef.current,
    });
  }, []);

  const resetHistory = useCallback(() => {
    undoRef.current = [];
    redoRef.current = [];
    versionRef.current = ++versionCounterRef.current;
    savedVersionRef.current = versionRef.current;
    setDocumentId(versionRef.current);
    syncHistoryStatus();
  }, [syncHistoryStatus]);

  /** Entrada de historial con el documento abierto, o null si no hay bytes cargados. */
  const snapshotCurrent = (): HistoryEntry | null => {
    const { arrayBuffer, fileName } = stateRef.current;
    return arrayBuffer ? { arrayBuffer, fileName, version: versionRef.current } : null;
  };

  // Clean expired cache on first load
  const cacheCleanedRef = useRef(false);
  if (!cacheCleanedRef.current) {
    cacheCleanedRef.current = true;
    clearExpiredCache().catch(() => {});
  }

  const loadFromArrayBuffer = useCallback(async (ab: ArrayBuffer, fileName: string, fileObj?: File) => {
    const oldDoc = pdfDocRef.current;
    pdfDocRef.current = null;

    // Clear document state immediately so the viewer unmounts and stops rendering
    setState({
      file: null,
      arrayBuffer: null,
      pdfDoc: null,
      pageInfos: [],
      numPages: 0,
      fileName,
      isLoading: true,
      loadProgress: 0,
      isEncrypted: false,
      error: null,
    });

    // Destroy the old doc after the React render cycle finishes unmounting the viewer
    if (oldDoc) {
      setTimeout(() => oldDoc.loadingTask.destroy(), 0);
    }

    try {
      // Compute hash for IndexedDB cache key
      const fileHash = await computeFileHash(ab);

      // Create a copy of the ArrayBuffer so pdf.js worker doesn't detach the original
      const abCopy = ab.slice(0);
      const loadingTask = openPdfDocument(abCopy);
      const pdfDoc = await loadingTask.promise;
      pdfDocRef.current = pdfDoc;

      const numPages = pdfDoc.numPages;
      const pageInfos: PdfPageInfo[] = [];

      // Phase 1: Fast metadata extraction (no canvas rendering)
      for (let i = 1; i <= numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const vp = page.getViewport({ scale: 1 });
        pageInfos.push({
          index: i - 1,
          width: vp.width,
          height: vp.height,
          thumbnailUrl: '',
        });
        page.cleanup();
      }

      // Check IndexedDB cache for thumbnails
      const cachedThumbs = await getCachedThumbnails(fileHash, numPages);

      if (cachedThumbs) {
        // ✅ Cache hit — load thumbnails instantly
        const pageInfosWithThumbs = pageInfos.map((info, i) => ({
          ...info,
          thumbnailUrl: cachedThumbs[i] || '',
        }));

        setState({
          file: fileObj || null,
          arrayBuffer: ab,
          pdfDoc,
          pageInfos: pageInfosWithThumbs,
          numPages,
          fileName,
          isLoading: false,
          loadProgress: 100,
          isEncrypted: false,
          error: null,
        });
      } else {
        // ❌ Cache miss — display immediately, generate in background
        setState({
          file: fileObj || null,
          arrayBuffer: ab,
          pdfDoc,
          pageInfos,
          numPages,
          fileName,
          isLoading: false,
          loadProgress: 100,
          isEncrypted: false,
          error: null,
        });

        // Phase 2: Background thumbnail generation + save to IndexedDB
        (async () => {
          const generatedThumbs: string[] = [];

          for (let i = 1; i <= numPages; i++) {
            if (pdfDocRef.current !== pdfDoc) break;

            try {
              const thumb = await generateThumbnail(pdfDoc, i);
              generatedThumbs.push(thumb.url);

              setState(prev => {
                if (prev.pdfDoc !== pdfDoc) return prev;
                const newInfos = [...prev.pageInfos];
                newInfos[i - 1] = { ...newInfos[i - 1], thumbnailUrl: thumb.url };
                return { ...prev, pageInfos: newInfos };
              });
            } catch (e: unknown) {
              if ((e as {name?: string})?.name === 'RenderingCancelledException') {
                break;
              }
              console.warn(`Failed to generate thumbnail for page ${i}`, e);
              generatedThumbs.push(''); // Keep array aligned
            }
          }

          // Save to IndexedDB if we generated all thumbs
          if (generatedThumbs.length === numPages && pdfDocRef.current === pdfDoc) {
            saveThumbnailsToCache(fileHash, generatedThumbs).catch(() => {});
          }
        })();
      }

      return pdfDoc;
    } catch (err: unknown) {
      console.warn('Failed to load PDF in viewer:', err);
      const isEncrypted = (err as {name?: string})?.name === 'PasswordException';

      setState({
        file: fileObj || null,
        arrayBuffer: ab,
        pdfDoc: null,
        pageInfos: [],
        numPages: 0,
        fileName,
        isLoading: false,
        loadProgress: 0,
        isEncrypted,
        error: isEncrypted
          ? 'El documento está protegido con contraseña.'
          : ((err as Error)?.message || 'Error al cargar el PDF.'),
      });

      return null;
    }
  }, []);

  const loadFile = useCallback(async (file: File) => {
    const ab = await file.arrayBuffer();
    resetHistory();
    await loadFromArrayBuffer(ab, file.name, file);
  }, [loadFromArrayBuffer, resetHistory]);

  /** Carga una versión en el visor sin tocar el historial. */
  const showVersion = useCallback(async (ab: ArrayBuffer, fileName: string) => {
    await loadFromArrayBuffer(ab, fileName, new File([ab], fileName, { type: 'application/pdf' }));
  }, [loadFromArrayBuffer]);

  const replaceWithBytes = useCallback(async (bytes: Uint8Array) => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const previous = snapshotCurrent();
      if (previous) {
        undoRef.current.push(previous);
        trimHistory(undoRef.current);
      }
      redoRef.current = [];
      versionRef.current = ++versionCounterRef.current;
      syncHistoryStatus();
      await showVersion(ab, stateRef.current.fileName);
    } finally {
      busyRef.current = false;
    }
  }, [showVersion, syncHistoryStatus]);

  const replaceWithBlob = useCallback(async (blob: Blob) => {
    await replaceWithBytes(new Uint8Array(await blob.arrayBuffer()));
  }, [replaceWithBytes]);

  /** Mueve una versión de `from` a `to` y la muestra (base de deshacer/rehacer). */
  const stepHistory = useCallback(async (
    from: React.RefObject<HistoryEntry[]>,
    to: React.RefObject<HistoryEntry[]>,
  ) => {
    if (busyRef.current || stateRef.current.isLoading) return;
    const target = from.current.pop();
    if (!target) return;
    busyRef.current = true;
    try {
      const current = snapshotCurrent();
      if (current) to.current.push(current);
      versionRef.current = target.version;
      syncHistoryStatus();
      await showVersion(target.arrayBuffer, target.fileName);
    } finally {
      busyRef.current = false;
    }
  }, [showVersion, syncHistoryStatus]);

  const undo = useCallback(() => stepHistory(undoRef, redoRef), [stepHistory]);
  const redo = useCallback(() => stepHistory(redoRef, undoRef), [stepHistory]);

  const markSaved = useCallback(() => {
    savedVersionRef.current = versionRef.current;
    syncHistoryStatus();
  }, [syncHistoryStatus]);

  const clearFile = useCallback(() => {
    resetHistory();
    const oldDoc = pdfDocRef.current;
    pdfDocRef.current = null;

    setState({
      file: null,
      arrayBuffer: null,
      pdfDoc: null,
      pageInfos: [],
      numPages: 0,
      fileName: '',
      isLoading: false,
      loadProgress: 0,
      isEncrypted: false,
      error: null,
    });

    if (oldDoc) {
      setTimeout(() => oldDoc.loadingTask.destroy(), 0);
    }
  }, [resetHistory]);

  return (
    <PdfContext.Provider value={{
      ...state,
      loadFile,
      replaceWithBytes,
      replaceWithBlob,
      clearFile,
      undo,
      redo,
      markSaved,
      ...historyStatus,
      documentId,
    }}>
      {children}
    </PdfContext.Provider>
  );
};
