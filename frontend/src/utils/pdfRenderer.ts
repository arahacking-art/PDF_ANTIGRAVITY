/**
 * pdfRenderer.ts
 * Renderiza páginas de PDF en el NAVEGADOR del usuario usando pdf.js.
 * Reemplaza completamente el endpoint /api/render-pages del backend.
 * No consume recursos del servidor.
 */
import * as pdfjsLib from 'pdfjs-dist';

// Configura el worker de pdf.js (bundled con Vite)
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

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
 */
export async function renderPdfPages(
  source: File | ArrayBuffer,
  scale = 1.5,
  quality = 0.85,
  onProgress?: (page: number, total: number) => void
): Promise<RenderedPage[]> {
  const data = source instanceof File ? await source.arrayBuffer() : source;

  const loadingTask = pdfjsLib.getDocument({ 
    data,
    cMapUrl: 'https://unpkg.com/pdfjs-dist@5.6.205/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: 'https://unpkg.com/pdfjs-dist@5.6.205/standard_fonts/',
  });
  const pdf = await loadingTask.promise;
  const total = pdf.numPages;
  const pages: RenderedPage[] = [];

  for (let i = 1; i <= total; i++) {
    const page = await pdf.getPage(i);
    const origViewport = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);

    const ctx = canvas.getContext('2d', { alpha: false })!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, canvas: canvas, viewport }).promise;

    pages.push({
      index: i - 1,
      dataUrl: canvas.toDataURL('image/jpeg', quality),
      originalWidth: origViewport.width,
      originalHeight: origViewport.height,
      renderedWidth: canvas.width,
      renderedHeight: canvas.height,
      scale,
    });

    page.cleanup();
    if (onProgress) onProgress(i, total);
  }

  return pages;
}

/**
 * Renderiza una sola página como canvas (para exportar a JPG/PNG).
 */
export async function renderPageAsCanvas(
  source: File | ArrayBuffer,
  pageIndex: number,
  scale = 2.0
): Promise<HTMLCanvasElement> {
  const data = source instanceof File ? await source.arrayBuffer() : source;
  const loadingTask = pdfjsLib.getDocument({
    data,
    cMapUrl: 'https://unpkg.com/pdfjs-dist@5.6.205/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: 'https://unpkg.com/pdfjs-dist@5.6.205/standard_fonts/',
  });
  const pdf = await loadingTask.promise;
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
