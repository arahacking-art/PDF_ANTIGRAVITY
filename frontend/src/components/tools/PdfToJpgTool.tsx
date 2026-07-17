import React, { useState, useEffect } from 'react';
import JSZip from 'jszip';
import { renderPageAsCanvas } from '../../utils/pdfRenderer';
import { usePdfContext } from '../../context/PdfContext';
import Dropzone from '../ui/Dropzone';
import Button from '../ui/Button';
import { Image, Loader, CheckCircle } from 'lucide-react';

const downloadBlob = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
};

const PdfToJpgTool: React.FC = () => {
  const ctx = usePdfContext();
  const workspaceFile = ctx.file;

  const [localFile, setLocalFile] = useState<File | null>(null);
  const [localPageCount, setLocalPageCount] = useState(0);

  const effectiveFile = workspaceFile || localFile;
  const pageCount = workspaceFile ? ctx.numPages : localPageCount;

  const [dpi, setDpi] = useState<'screen' | 'print' | 'high'>('print');
  const [quality, setQuality] = useState(90);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const DPI_SCALES: Record<string, number> = { screen: 1.5, print: 2.0, high: 3.0 };
  const DPI_LABELS: Record<string, string> = { screen: '96 DPI — Pantalla', print: '150 DPI — Impresión', high: '220 DPI — Alta calidad' };

  // Reset done state when effective file changes
  useEffect(() => {
    setDone(false);
    setError(null);
  }, [effectiveFile]);

  const handleFileSelected = async (files: File[]) => {
    if (!files[0]) return;
    const f = files[0];
    setLocalFile(f); setDone(false); setError(null);
    try {
      const { getDocument } = await import('pdfjs-dist');
      const ab = await f.arrayBuffer();
      const pdf = await getDocument({ data: ab }).promise;
      setLocalPageCount(pdf.numPages);
    } catch { setLocalPageCount(0); }
  };

  const handleConvert = async () => {
    if (!effectiveFile) return;
    setIsProcessing(true); setProgress(0); setError(null); setDone(false);
    try {
      const scale = DPI_SCALES[dpi];
      const ab = await effectiveFile.arrayBuffer();
      const { getDocument } = await import('pdfjs-dist');
      const pdf = await getDocument({ data: ab }).promise;
      const total = pdf.numPages;

      if (total === 1) {
        const canvas = await renderPageAsCanvas(ab, 0, scale);
        const blob = await new Promise<Blob>(res => canvas.toBlob(b => res(b!), 'image/jpeg', quality / 100));
        const name = effectiveFile.name.replace(/\.pdf$/i, '.jpg');
        downloadBlob(blob, name);
      } else {
        const zip = new JSZip();
        const baseName = effectiveFile.name.replace(/\.pdf$/i, '');
        for (let i = 0; i < total; i++) {
          const canvas = await renderPageAsCanvas(ab, i, scale);
          const blob = await new Promise<Blob>(res => canvas.toBlob(b => res(b!), 'image/jpeg', quality / 100));
          const arrayBuffer = await blob.arrayBuffer();
          zip.file(`${baseName}_pagina_${String(i + 1).padStart(3, '0')}.jpg`, arrayBuffer);
          setProgress(Math.round((i + 1) / total * 100));
        }
        const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
        downloadBlob(zipBlob, `${baseName}_imagenes.zip`);
      }
      setDone(true);
    } catch (e: any) { setError(e.message || 'Error al convertir'); }
    finally { setIsProcessing(false); }
  };

  const hasFile = !!effectiveFile;

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-5">
      <div className="flex items-center gap-3 pb-2 border-b border-gray-200">
        <div className="p-2 bg-blue-50 rounded-lg"><Image className="w-5 h-5 text-blue-600" /></div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">PDF a JPG</h1>
          <p className="text-sm text-gray-500">Convierte cada página del PDF en imagen JPG. 100% en tu navegador.</p>
        </div>
      </div>

      {!hasFile ? (
        <Dropzone onFilesSelected={handleFileSelected} accept={{ 'application/pdf': ['.pdf'] }} multiple={false} />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200 shadow-sm">
            <div>
              <p className="text-sm font-medium text-gray-700">{effectiveFile.name}</p>
              {pageCount > 0 && <p className="text-xs text-gray-400">{pageCount} página{pageCount > 1 ? 's' : ''}{pageCount > 1 ? ' → ZIP con imágenes' : ' → 1 JPG'}</p>}
            </div>
            {workspaceFile ? (
              <span className="text-xs text-blue-600 font-medium px-2 py-1 bg-blue-50 border border-blue-200 rounded">Workspace</span>
            ) : (
              <button onClick={() => { setLocalFile(null); setDone(false); setLocalPageCount(0); }} className="text-xs text-red-500 hover:text-red-700">Cambiar</button>
            )}
          </div>

          {/* Options */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Resolución</label>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(DPI_LABELS).map(([key, label]) => (
                  <button key={key} onClick={() => setDpi(key as any)}
                    className={`px-2 py-2 rounded-lg border text-xs font-medium transition-all ${dpi === key ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <label className="text-sm font-medium text-gray-700">Calidad JPG</label>
                <span className="text-sm text-blue-600 font-semibold">{quality}%</span>
              </div>
              <input type="range" min={60} max={100} step={5} value={quality} onChange={e => setQuality(parseInt(e.target.value))}
                className="w-full accent-blue-600" />
              <div className="flex justify-between text-xs text-gray-400">
                <span>Menor tamaño</span><span>Mayor calidad</span>
              </div>
            </div>
          </div>

          {isProcessing && (
            <div className="flex flex-col items-center py-6 gap-3">
              <Loader className="w-6 h-6 text-blue-500 animate-spin" />
              <div className="w-48 bg-gray-200 rounded-full h-1.5">
                <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-sm text-gray-500">Convirtiendo... {progress}%</p>
            </div>
          )}

          {done && !isProcessing && (
            <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <p className="text-sm text-green-700 font-medium">
                {pageCount > 1 ? `¡${pageCount} imágenes exportadas en un ZIP!` : '¡Imagen descargada correctamente!'}
              </p>
            </div>
          )}

          {error && <div className="p-3 text-sm text-red-700 bg-red-50 rounded-lg border border-red-200">{error}</div>}

          <div className="flex justify-end pt-2 border-t border-gray-200">
            <Button onClick={handleConvert} disabled={isProcessing} size="lg">
              {isProcessing
                ? <span className="flex items-center gap-2"><Loader className="w-4 h-4 animate-spin" />Convirtiendo...</span>
                : `Convertir a JPG${pageCount > 1 ? ' (ZIP)' : ''}`
              }
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PdfToJpgTool;
