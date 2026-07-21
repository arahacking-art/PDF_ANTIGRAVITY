import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

// Configure pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

const PDFJS_OPTIONS = {
  cMapUrl: 'https://unpkg.com/pdfjs-dist@5.6.205/cmaps/',
  cMapPacked: true,
  standardFontDataUrl: 'https://unpkg.com/pdfjs-dist@5.6.205/standard_fonts/',
};

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
}

interface PdfContextValue extends PdfState {
  /** Load a File into the workspace */
  loadFile: (file: File) => Promise<void>;
  /** Replace the current PDF with new bytes (for chaining tools) */
  replaceWithBytes: (bytes: Uint8Array, newFileName?: string) => Promise<void>;
  /** Replace the current PDF with a Blob (e.g. from backend response) */
  replaceWithBlob: (blob: Blob, newFileName?: string) => Promise<void>;
  /** Clear the workspace (no file loaded) */
  clearFile: () => void;
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
  });

  // Keep a ref to the pdfDoc so we can destroy it on cleanup
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);

  const loadFromArrayBuffer = useCallback(async (ab: ArrayBuffer, fileName: string, fileObj?: File) => {
    // Cleanup previous doc
    if (pdfDocRef.current) {
      pdfDocRef.current.destroy();
      pdfDocRef.current = null;
    }

    setState(prev => ({ ...prev, isLoading: true, loadProgress: 0, fileName }));

    // Create a copy of the ArrayBuffer so pdf.js worker doesn't detach the original
    // which would corrupt the file bytes for other tools or downloads.
    const abCopy = ab.slice(0);
    const loadingTask = pdfjsLib.getDocument({ data: abCopy, ...PDFJS_OPTIONS });
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
        thumbnailUrl: '', // Will be generated asynchronously
      });
      page.cleanup();
    }

    // Immediately display the PDF without waiting for thumbnails!
    setState({
      file: fileObj || null,
      arrayBuffer: ab,
      pdfDoc,
      pageInfos,
      numPages,
      fileName,
      isLoading: false,
      loadProgress: 100,
    });

    // Phase 2: Background thumbnail generation
    (async () => {
      for (let i = 1; i <= numPages; i++) {
        // Double check if document was changed while we were generating
        if (pdfDocRef.current !== pdfDoc) break;
        
        try {
          const thumb = await generateThumbnail(pdfDoc, i);
          setState(prev => {
            // Only update if this is still the active document
            if (prev.pdfDoc !== pdfDoc) return prev;
            const newInfos = [...prev.pageInfos];
            newInfos[i - 1] = { ...newInfos[i - 1], thumbnailUrl: thumb.url };
            return { ...prev, pageInfos: newInfos };
          });
        } catch (e: any) {
          if (e?.name === 'RenderingCancelledException') {
            break; // Silently abort, doc was replaced or destroyed
          }
          console.warn(`Failed to generate thumbnail for page ${i}`, e);
        }
      }
    })();

    return pdfDoc;
  }, []);

  const loadFile = useCallback(async (file: File) => {
    const ab = await file.arrayBuffer();
    await loadFromArrayBuffer(ab, file.name, file);
  }, [loadFromArrayBuffer]);

  const replaceWithBytes = useCallback(async (bytes: Uint8Array, newFileName?: string) => {
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const name = newFileName || state.fileName;
    const fileObj = new File([ab], name, { type: 'application/pdf' });
    await loadFromArrayBuffer(ab, name, fileObj);
  }, [loadFromArrayBuffer, state.fileName]);

  const replaceWithBlob = useCallback(async (blob: Blob, newFileName?: string) => {
    const ab = await blob.arrayBuffer();
    const name = newFileName || state.fileName;
    const fileObj = new File([blob], name, { type: 'application/pdf' });
    await loadFromArrayBuffer(ab, name, fileObj);
  }, [loadFromArrayBuffer, state.fileName]);

  const clearFile = useCallback(() => {
    if (pdfDocRef.current) {
      pdfDocRef.current.destroy();
      pdfDocRef.current = null;
    }
    setState({
      file: null,
      arrayBuffer: null,
      pdfDoc: null,
      pageInfos: [],
      numPages: 0,
      fileName: '',
      isLoading: false,
      loadProgress: 0,
    });
  }, []);

  return (
    <PdfContext.Provider value={{
      ...state,
      loadFile,
      replaceWithBytes,
      replaceWithBlob,
      clearFile,
    }}>
      {children}
    </PdfContext.Provider>
  );
};
