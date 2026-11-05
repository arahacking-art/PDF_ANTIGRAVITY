/**
 * pdfLoad.ts
 * Carga segura de PDFs con pdf-lib, incluidos los PDFs cifrados.
 *
 * Problema: muchos PDFs firmados digitalmente (facturas electrónicas, contratos,
 * certificados de cámara de comercio, planillas de seguridad social...) se emiten
 * CIFRADOS con una contraseña de propietario que solo restringe permisos (editar,
 * copiar), pero SIN contraseña de apertura. Cualquier visor los abre, pero pdf-lib
 * no sabe descifrar y lanza:
 *   "Input document to `PDFDocument.load` is encrypted..."
 *
 * `ignoreEncryption: true` NO es la solución: pdf-lib cargaría la estructura pero los
 * contenidos seguirían cifrados y el resultado saldría con páginas en blanco o dañadas.
 *
 * Solución: si el documento está cifrado, se descifra en el backend (pikepdf/qpdf)
 * y se vuelve a cargar. Solo cuesta una petición extra para los PDFs cifrados; los
 * normales se cargan igual que antes, sin red.
 *
 * Funciona tanto en el hilo principal como dentro de Web Workers (usa fetch + FormData).
 */
import { PDFDocument } from 'pdf-lib';
import { BACKEND_URL } from '../config/api';

type PdfBytes = ArrayBuffer | Uint8Array;

/** Envía el PDF al backend para quitarle el cifrado de permisos. */
export async function decryptPdfBytes(bytes: PdfBytes, fileName = 'documento.pdf'): Promise<ArrayBuffer> {
  const formData = new FormData();
  formData.append('file', new Blob([bytes as BlobPart], { type: 'application/pdf' }), fileName);

  let response: Response;
  try {
    response = await fetch(`${BACKEND_URL}/api/decrypt`, { method: 'POST', body: formData });
  } catch {
    throw new Error(
      `"${fileName}" está cifrado (p. ej. por una firma digital) y no se pudo contactar al servidor para procesarlo.`,
    );
  }

  if (!response.ok) {
    const errData = await response.json().catch(() => ({ detail: '' }));
    if (response.status === 401) {
      throw new Error(
        `"${fileName}" está protegido con contraseña de apertura. Usa la herramienta "Quitar contraseña" primero.`,
      );
    }
    if (response.status === 429) {
      throw new Error('Demasiadas peticiones al servidor. Espera unos segundos e intenta de nuevo.');
    }
    throw new Error(errData.detail || `No se pudo procesar el PDF cifrado "${fileName}".`);
  }

  return response.arrayBuffer();
}

/**
 * Reemplazo de `PDFDocument.load(bytes)` que soporta PDFs cifrados con restricciones
 * de permisos (típico de documentos firmados digitalmente).
 */
export async function loadPdfDocument(bytes: PdfBytes, fileName = 'documento.pdf'): Promise<PDFDocument> {
  // ignoreEncryption solo para poder inspeccionar `isEncrypted` sin lanzar excepción;
  // nunca se devuelve un documento que siga cifrado.
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  if (!doc.isEncrypted) return doc;

  const decrypted = await decryptPdfBytes(bytes, fileName);
  return PDFDocument.load(decrypted);
}
