/**
 * download.ts
 * Utilidades compartidas para descargar resultados y mostrar tamaños de archivo.
 */

/**
 * Descarga un Blob en el navegador con el nombre indicado.
 * La URL temporal se revoca con un pequeño retraso: revocarla justo después de
 * click() puede cancelar la descarga en algunos navegadores (Firefox/Safari).
 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Formatea un tamaño en bytes como B, KB o MB. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
