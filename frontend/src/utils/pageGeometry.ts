/**
 * pageGeometry.ts
 * Conversión entre las coordenadas del visor y las coordenadas internas de pdf-lib.
 *
 * El visor (pdf.js) muestra cada página con su CropBox y su rotación (/Rotate) ya
 * aplicados, y las herramientas guardan posiciones como proporciones (0-1) de esa
 * vista, con origen arriba-izquierda. pdf-lib, en cambio, dibuja en el espacio de
 * usuario SIN rotar, con origen abajo-izquierda del MediaBox. Usar page.getSize()
 * directamente colocaba firmas y anotaciones en otro lugar en páginas rotadas o
 * con CropBox desplazado.
 */
import { degrees, type PDFPage, type Rotation } from 'pdf-lib';

export type PageRotation = 0 | 90 | 180 | 270;

/** Rotación de la página normalizada a 0, 90, 180 o 270 grados (sentido horario). */
export function getPageRotation(page: PDFPage): PageRotation {
  const angle = ((page.getRotation().angle % 360) + 360) % 360;
  return ((Math.round(angle / 90) * 90) % 360) as PageRotation;
}

/** Tamaño de la página tal como se ve en el visor (CropBox + rotación), en puntos PDF. */
export function getViewSize(page: PDFPage): { width: number; height: number } {
  const { width, height } = page.getCropBox();
  const rotation = getPageRotation(page);
  return rotation === 90 || rotation === 270 ? { width: height, height: width } : { width, height };
}

/**
 * Convierte un punto de la vista (proporciones 0-1, origen arriba-izquierda)
 * a coordenadas de pdf-lib (puntos PDF, espacio sin rotar, origen abajo-izquierda).
 */
export function viewToPdf(page: PDFPage, u: number, v: number): { x: number; y: number } {
  const { x: x0, y: y0, width: w, height: h } = page.getCropBox();
  const view = getViewSize(page);
  const pu = u * view.width;
  const pv = v * view.height;
  switch (getPageRotation(page)) {
    case 90:  return { x: x0 + pv,     y: y0 + pu };
    case 180: return { x: x0 + w - pu, y: y0 + pv };
    case 270: return { x: x0 + w - pv, y: y0 + h - pu };
    default:  return { x: x0 + pu,     y: y0 + h - pv };
  }
}

/**
 * Rotación que hay que pasar a drawImage/drawText para que el elemento se vea
 * derecho en el visor (compensa el /Rotate de la página).
 */
export function uprightRotation(page: PDFPage): Rotation {
  return degrees(getPageRotation(page));
}
