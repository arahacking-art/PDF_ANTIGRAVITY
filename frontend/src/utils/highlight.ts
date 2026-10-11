/**
 * highlight.ts
 * Escribe resaltados de texto como anotaciones /Highlight reales del PDF, para que
 * se conserven al descargar y se vean (y se puedan borrar) en Acrobat, Chrome, etc.
 */
import { PDFDocument, PDFString } from 'pdf-lib';
import { viewToPdf } from './pageGeometry';

/** Rectángulo en proporciones (0-1) de la página tal como se ve, origen arriba-izquierda. */
export interface ViewRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Amarillo de resaltador (RGB 0-1)
const HIGHLIGHT_COLOR = [1, 0.88, 0];

const fmt = (n: number) => n.toFixed(2);

/**
 * Añade un resaltado por página con los rectángulos indicados (una selección puede
 * abarcar varias líneas: cada línea es un "quad" de la misma anotación).
 */
export async function addHighlights(
  pdfBytes: ArrayBuffer,
  rectsByPage: Map<number, ViewRect[]>,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes);
  const { context } = doc;

  for (const [pageIndex, rects] of rectsByPage) {
    if (rects.length === 0 || pageIndex < 0 || pageIndex >= doc.getPageCount()) continue;
    const page = doc.getPage(pageIndex);

    // QuadPoints por línea: arriba-izq, arriba-der, abajo-izq, abajo-der (orden que usa Acrobat).
    // Se calculan desde la vista para respetar la orientación del texto en páginas rotadas.
    const quads = rects.map(r => [
      viewToPdf(page, r.x, r.y),
      viewToPdf(page, r.x + r.width, r.y),
      viewToPdf(page, r.x, r.y + r.height),
      viewToPdf(page, r.x + r.width, r.y + r.height),
    ]);
    const points = quads.flat();
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const bbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];

    // Apariencia: polígonos amarillos en modo "multiplicar" para que el texto siga legible.
    // Algunos visores no generan la apariencia si falta, por eso se incluye.
    const shapes = quads
      .map(([ul, ur, ll, lr]) =>
        `${fmt(ul.x)} ${fmt(ul.y)} m ${fmt(ur.x)} ${fmt(ur.y)} l ${fmt(lr.x)} ${fmt(lr.y)} l ${fmt(ll.x)} ${fmt(ll.y)} l h f`)
      .join('\n');
    const appearance = context.stream(
      `/GS0 gs ${HIGHLIGHT_COLOR.join(' ')} rg\n${shapes}`,
      {
        Type: 'XObject',
        Subtype: 'Form',
        BBox: bbox,
        Resources: { ExtGState: { GS0: { Type: 'ExtGState', BM: 'Multiply' } } },
      },
    );

    const annot = context.obj({
      Type: 'Annot',
      Subtype: 'Highlight',
      Rect: bbox,
      QuadPoints: points.flatMap(p => [p.x, p.y]),
      C: HIGHLIGHT_COLOR,
      F: 4, // imprimible
      P: page.ref,
      M: PDFString.fromDate(new Date()),
      AP: { N: context.register(appearance) },
    });
    page.node.addAnnot(context.register(annot));
  }

  return doc.save();
}
