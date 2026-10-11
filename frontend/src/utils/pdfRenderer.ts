/**
 * pdfRenderer.ts
 * Renderiza páginas de PDF en el NAVEGADOR del usuario usando pdf.js.
 * Reemplaza completamente el endpoint /api/render-pages del backend.
 * No consume recursos del servidor.
 */
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { openPdfDocument } from '../config/pdfjs';

export interface RenderedPage {
  index: number;          // 0-based
  dataUrl: string;        // JPEG base64 para mostrar en <img>
  originalWidth: number;  // Ancho en puntos PDF (sin escala)
  originalHeight: number; // Alto en puntos PDF (sin escala)
  renderedWidth: number;  // Píxeles del canvas renderizado
  renderedHeight: number;
  scale: number;
}

/**
 * Renderiza todas las páginas de un PDF como imágenes JPEG.
 * Corre 100% en el navegador. Muy rápido para thumbnails (scale=0.5-1).
 * Cada imagen queda en memoria como dataURL: usar escalas bajas para listas de miniaturas.
 */
export async function renderPdfPages(
  source: File | ArrayBuffer,
  scale = 1.5,
  quality = 0.85,
  onProgress?: (page: number, total: number) => void
): Promise<RenderedPage[]> {
  const data = source instanceof File ? await source.arrayBuffer() : source;

  const loadingTask = openPdfDocument(data);
  try {
    const pdf = await loadingTask.promise;
    const total = pdf.numPages;
    const pages: RenderedPage[] = [];

    for (let i = 1; i <= total; i++) {
      const page = await pdf.getPage(i);
      const origViewport = page.getViewport({ scale: 1 });
      const canvas = await renderPageToCanvas(pdf, i - 1, scale);

      pages.push({
        index: i - 1,
        dataUrl: canvas.toDataURL('image/jpeg', quality),
        originalWidth: origViewport.width,
        originalHeight: origViewport.height,
        renderedWidth: canvas.width,
        renderedHeight: canvas.height,
        scale,
      });

      releaseCanvas(canvas);
      if (onProgress) onProgress(i, total);
    }

    return pages;
  } finally {
    // Libera el documento en el worker de pdf.js (antes quedaba vivo indefinidamente).
    await loadingTask.destroy();
  }
}

/**
 * Renderiza una página de un documento YA abierto como canvas (para exportar a JPG/PNG).
 * Recibe el documento en lugar de los bytes para no volver a parsear el PDF completo
 * por cada página (antes, exportar 100 páginas cargaba el documento 100 veces).
 */
export async function renderPageToCanvas(
  pdf: PDFDocumentProxy,
  pageIndex: number,
  scale = 2.0
): Promise<HTMLCanvasElement> {
  const page = await pdf.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);

  const ctx = canvas.getContext('2d', { alpha: false })!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvasContext: ctx, canvas: canvas, viewport }).promise;
  page.cleanup();

  return canvas;
}

/** Libera de inmediato la memoria del bitmap de un canvas que ya no se usa. */
export function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}
