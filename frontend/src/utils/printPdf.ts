/**
 * printPdf.ts
 * Imprime el documento abierto (Ctrl+P) en lugar de la página web.
 *
 * Igual que el visor de pdf.js: cada página se dibuja como imagen a resolución de
 * impresión y se imprimen solo esas imágenes. Imprimir el PDF en un iframe no sirve
 * aquí: la CSP de producción (default-src 'self', object-src 'none') bloquea el
 * visor de PDF del navegador dentro de un iframe blob:.
 */
import type { PDFDocumentProxy } from 'pdfjs-dist';

const PRINT_DPI = 150;
const CONTAINER_ID = 'print-container';

export interface PrintProgress {
  done: number;
  total: number;
}

/**
 * Prepara las páginas y abre el diálogo de impresión.
 * `isCancelled` permite abortar mientras se preparan las páginas.
 */
export async function printPdfDocument(
  pdfDoc: PDFDocumentProxy,
  onProgress: (p: PrintProgress) => void,
  isCancelled: () => boolean,
): Promise<void> {
  document.getElementById(CONTAINER_ID)?.remove();
  const container = document.createElement('div');
  container.id = CONTAINER_ID;
  const urls: string[] = [];

  const cleanup = () => {
    container.remove();
    document.getElementById(`${CONTAINER_ID}-style`)?.remove();
    urls.forEach(u => URL.revokeObjectURL(u));
  };

  try {
    const total = pdfDoc.numPages;
    for (let i = 1; i <= total; i++) {
      if (isCancelled()) { cleanup(); return; }
      onProgress({ done: i - 1, total });

      const page = await pdfDoc.getPage(i);
      const cssViewport = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: PRINT_DPI / 72 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext('2d', { alpha: false })!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // intent 'print' respeta las anotaciones marcadas como imprimibles (p. ej. resaltados)
      await page.render({ canvasContext: ctx, canvas, viewport, intent: 'print' }).promise;
      page.cleanup();

      const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', 0.92));
      if (!blob) throw new Error(`No se pudo preparar la página ${i}`);
      const url = URL.createObjectURL(blob);
      urls.push(url);

      const img = document.createElement('img');
      img.src = url;
      // Tamaño real de la página (1 punto PDF = 1pt CSS)
      img.style.width = `${cssViewport.width}pt`;
      img.style.height = `${cssViewport.height}pt`;
      const wrapper = document.createElement('div');
      wrapper.className = 'print-page';
      wrapper.appendChild(img);
      container.appendChild(wrapper);
      await img.decode();
    }
    onProgress({ done: total, total });
    if (isCancelled()) { cleanup(); return; }

    // El tamaño de hoja sigue a la primera página; sin márgenes para no reescalar
    const first = (await pdfDoc.getPage(1)).getViewport({ scale: 1 });
    const style = document.createElement('style');
    style.id = `${CONTAINER_ID}-style`;
    style.textContent = `@page { size: ${first.width}pt ${first.height}pt; margin: 0; }`;
    document.head.appendChild(style);
    document.body.appendChild(container);

    window.addEventListener('afterprint', cleanup, { once: true });
    window.print();
  } catch (e) {
    cleanup();
    throw e;
  }
}
