/**
 * copy-pdfjs-assets.mjs
 * Copia los recursos auxiliares de pdf.js (CMaps, fuentes estándar, decodificadores
 * WASM y perfiles ICC) desde node_modules a public/pdfjs/, para servirlos desde el
 * mismo origen que la app.
 *
 * Antes se descargaban de unpkg.com: la CSP de producción (connect-src 'self') los
 * bloqueaba, en una intranet sin salida a Internet no cargaban, y su versión fija
 * no coincidía con la de pdfjs-dist instalada.
 *
 * Se ejecuta automáticamente en `dev` y `build` (ver package.json).
 */
import { cpSync, rmSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const pdfjsDir = dirname(require.resolve('pdfjs-dist/package.json'));
const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'pdfjs');

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

for (const dir of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
  cpSync(join(pdfjsDir, dir), join(outDir, dir), {
    recursive: true,
    // quickjs-eval solo sirve para ejecutar JavaScript embebido en PDFs (scripting),
    // que la app no usa: no se publica.
    filter: (src) => !src.includes('quickjs'),
  });
}

console.log(`pdf.js assets copiados a ${outDir}`);
