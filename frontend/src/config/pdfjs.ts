/**
 * pdfjs.ts
 * Configuración única de pdf.js para toda la app.
 *
 * Los recursos auxiliares se sirven desde el mismo origen (public/pdfjs/, generado por
 * scripts/copy-pdfjs-assets.mjs) en lugar de unpkg.com, que la CSP bloqueaba en producción.
 */
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

const ASSETS_BASE = `${import.meta.env.BASE_URL}pdfjs/`;

/** Opciones comunes para todas las llamadas a pdfjsLib.getDocument(). */
export const PDFJS_DOCUMENT_OPTIONS = {
  cMapUrl: `${ASSETS_BASE}cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `${ASSETS_BASE}standard_fonts/`,
  wasmUrl: `${ASSETS_BASE}wasm/`,
  iccUrl: `${ASSETS_BASE}iccs/`,
  // Defensa en profundidad: pdf.js no compila código con eval/new Function (vector de
  // CVE-2024-4367). Además la CSP de producción lo bloquea y generaba violaciones.
  isEvalSupported: false,
};

/** Abre un documento con la configuración de la app. */
export function openPdfDocument(data: ArrayBuffer | Uint8Array) {
  return pdfjsLib.getDocument({ data, ...PDFJS_DOCUMENT_OPTIONS });
}
