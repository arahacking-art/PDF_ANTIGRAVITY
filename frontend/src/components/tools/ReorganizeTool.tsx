import React, { useState, useEffect } from 'react';
import { PDFDocument } from 'pdf-lib';
import { renderPdfPages, type RenderedPage } from '../../utils/pdfRenderer';
import { usePdfContext } from '../../context/PdfContext';
import Dropzone from '../ui/Dropzone';
import Button from '../ui/Button';
import { LayoutGrid, Loader, GripVertical, CheckCircle } from 'lucide-react';

const downloadBlob = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
};

const ReorganizeTool: React.FC = () => {
  const ctx = usePdfContext();
  const workspaceFile = ctx.file;

  const [localFile, setLocalFile] = useState<File | null>(null);
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [pageOrder, setPageOrder] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);

  const effectiveFile = workspaceFile || localFile;
  const effectiveFileName = workspaceFile ? ctx.fileName : localFile?.name || '';

  const loadPages = async (f: File) => {
    setError(null); setPages([]); setPageOrder([]); setResultBlob(null);
    setIsLoading(true); setProgress(0);
    try {
      const rendered = await renderPdfPages(f, 2.0, 0.95, (p, t) => setProgress(Math.round(p / t * 100)));
      setPages(rendered);
      setPageOrder(rendered.map((_, i) => i));
    } catch (e: any) { setError(e.message || 'Error al cargar el PDF'); }
    finally { setIsLoading(false); }
  };

  useEffect(() => {
    if (workspaceFile && pages.length === 0 && !isLoading) {
      loadPages(workspaceFile);
    }
  }, [workspaceFile]);

  const handleFileSelected = async (files: File[]) => {
    if (!files[0]) return;
    setLocalFile(files[0]);
    await loadPages(files[0]);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null); setDragOverIndex(null); return;
    }
    const newOrder = [...pageOrder];
    const [removed] = newOrder.splice(draggedIndex, 1);
    newOrder.splice(dropIndex, 0, removed);
    setPageOrder(newOrder);
    setDraggedIndex(null); setDragOverIndex(null);
  };

  const move = (index: number, dir: -1 | 1) => {
    const swap = index + dir;
    if (swap < 0 || swap >= pageOrder.length) return;
    const newOrder = [...pageOrder];
    [newOrder[index], newOrder[swap]] = [newOrder[swap], newOrder[index]];
    setPageOrder(newOrder);
  };

  const handleReorganize = async () => {
    if (!effectiveFile) return;
    setIsProcessing(true); setError(null); setResultBlob(null);
    try {
      const arrayBuffer = await effectiveFile.arrayBuffer();
      const original = await PDFDocument.load(arrayBuffer);
      const newPdf = await PDFDocument.create();
      const copied = await newPdf.copyPages(original, pageOrder);
      copied.forEach(p => newPdf.addPage(p));
      const bytes = await newPdf.save();
      const blob = new Blob([bytes], { type: 'application/pdf' });
      setResultBlob(blob);
    } catch (e: any) { setError(e.message || 'Error al reorganizar'); }
    finally { setIsProcessing(false); }
  };

  const isOriginal = pageOrder.every((v, i) => v === i);

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 pb-2 border-b border-gray-200">
        <div className="p-2 bg-blue-50 rounded-lg"><LayoutGrid className="w-5 h-5 text-blue-600" /></div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Reorganizar Páginas</h1>
          <p className="text-sm text-gray-500">Arrastra las páginas para reordenarlas. Procesado en tu navegador.</p>
        </div>
      </div>

      {!effectiveFile ? (
        <Dropzone onFilesSelected={handleFileSelected} accept={{ 'application/pdf': ['.pdf'] }} multiple={false} />
      ) : (
        <>
          <div className="flex items-center justify-between px-4 py-4 bg-white rounded-lg border border-gray-200 shadow-sm">
            <span className="text-base font-semibold text-gray-700 truncate max-w-xs">{effectiveFileName}</span>
            <div className="flex items-center gap-4">
              {!isOriginal && <span className="text-sm font-medium bg-blue-100 text-blue-700 px-3 py-1 rounded-full">Modificado</span>}
              {!workspaceFile && (
                <button onClick={() => { setLocalFile(null); setPages([]); }} className="text-sm font-medium text-red-500 hover:text-red-700">Cambiar</button>
              )}
            </div>
          </div>

          {isLoading && (
            <div className="flex flex-col items-center py-12 gap-3">
              <Loader className="w-7 h-7 text-blue-500 animate-spin" />
              <div className="w-48 bg-gray-200 rounded-full h-1.5">
                <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-sm text-gray-500">Renderizando páginas... {progress}%</p>
            </div>
          )}

          {!isLoading && pages.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {pageOrder.map((origIdx, newPos) => {
                const page = pages[origIdx];
                const isDragging = draggedIndex === newPos;
                const isOver = dragOverIndex === newPos && draggedIndex !== newPos;
                return (
                  <div
                    key={`${newPos}-${origIdx}`}
                    draggable
                    onDragStart={() => setDraggedIndex(newPos)}
                    onDragOver={(e) => { e.preventDefault(); setDragOverIndex(newPos); }}
                    onDrop={(e) => handleDrop(e, newPos)}
                    onDragEnd={() => { setDraggedIndex(null); setDragOverIndex(null); }}
                    className={[
                      'relative rounded-lg border-2 overflow-hidden cursor-grab active:cursor-grabbing',
                      'transition-all duration-150 bg-white',
                      isDragging ? 'opacity-30 scale-95 border-blue-400' : '',
                      isOver ? 'border-blue-500 shadow-xl scale-[1.03]' : 'border-gray-200 hover:border-gray-300 hover:shadow-md',
                    ].join(' ')}
                  >
                    <div className="aspect-[0.707] overflow-hidden bg-gray-50">
                      <img src={page.dataUrl} alt={`Pág ${origIdx + 1}`} className="w-full h-full object-cover" draggable={false} />
                    </div>
                    {/* Position badge */}
                    <div className="absolute top-1.5 left-1.5 bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow">
                      {newPos + 1}
                    </div>
                    {/* Original page */}
                    <div className="absolute top-1.5 right-1.5 bg-black/40 text-white text-[10px] px-1 py-0.5 rounded">
                      p.{origIdx + 1}
                    </div>
                    {/* Footer controls */}
                    <div className="flex items-center justify-between px-1.5 py-1 bg-gray-50 border-t border-gray-100">
                      <button onClick={() => move(newPos, -1)} disabled={newPos === 0} className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-20 text-xs">←</button>
                      <GripVertical className="w-3 h-3 text-gray-300" />
                      <button onClick={() => move(newPos, 1)} disabled={newPos === pageOrder.length - 1} className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-20 text-xs">→</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {resultBlob && !isProcessing && (
            <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg shadow-sm">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
              <p className="text-sm text-green-800 font-medium flex-1">
                ¡Páginas reorganizadas correctamente!
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => downloadBlob(resultBlob, `reorganizado_${effectiveFileName}`)}>
                  Descargar
                </Button>
                {workspaceFile && (
                  <Button size="sm" onClick={async () => {
                    await ctx.replaceWithBlob(resultBlob, `reorganizado_${effectiveFileName}`);
                    setResultBlob(null);
                    setPages([]);
                  }}>
                    Reemplazar en Workspace
                  </Button>
                )}
              </div>
            </div>
          )}

          {error && <div className="p-3 text-sm text-red-700 bg-red-50 rounded-lg border border-red-200">{error}</div>}

          {pages.length > 0 && !resultBlob && (
            <div className="flex items-center justify-between pt-4 border-t border-gray-200">
              <button onClick={() => setPageOrder(pages.map((_, i) => i))} disabled={isOriginal} className="text-base font-medium text-gray-600 hover:text-gray-900 disabled:opacity-30">
                Restablecer orden
              </button>
              <Button onClick={handleReorganize} disabled={isOriginal || isProcessing} size="lg">
                {isProcessing ? 'Generando...' : 'Guardar nuevo orden'}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ReorganizeTool;
