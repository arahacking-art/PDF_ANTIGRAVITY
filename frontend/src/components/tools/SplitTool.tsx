import React, { useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { renderPdfPages, type RenderedPage } from '../../utils/pdfRenderer';
import { usePdfContext } from '../../context/PdfContext';
import Dropzone from '../ui/Dropzone';
import Button from '../ui/Button';
import { Scissors, Loader, CheckCircle } from 'lucide-react';

const downloadBlob = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
};

const SplitTool: React.FC = () => {
  const ctx = usePdfContext();
  const workspaceFile = ctx.file;

  const [localFile, setLocalFile] = useState<File | null>(null);
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [marked, setMarked] = useState<Set<number>>(new Set());
  const [mode, setMode] = useState<'keep' | 'delete'>('keep');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);

  const effectiveFile = workspaceFile || localFile;
  const effectiveFileName = workspaceFile ? ctx.fileName : localFile?.name || '';

  const loadPages = async (f: File) => {
    setMarked(new Set()); setError(null); setPages([]); setResultBlob(null);
    setIsLoading(true); setProgress(0);
    try {
      const rendered = await renderPdfPages(f, 2.0, 0.95, (p, t) => setProgress(Math.round(p / t * 100)));
      setPages(rendered);
    } catch (e: any) { setError(e.message || 'Error al cargar el PDF'); }
    finally { setIsLoading(false); }
  };

  // Auto-load workspace file when it changes
  React.useEffect(() => {
    if (workspaceFile && pages.length === 0 && !isLoading) {
      loadPages(workspaceFile);
    }
  }, [workspaceFile]);

  const handleFileSelected = async (files: File[]) => {
    if (!files[0]) return;
    setLocalFile(files[0]);
    await loadPages(files[0]);
  };

  const toggle = (idx: number) => setMarked(prev => {
    const s = new Set(prev); s.has(idx) ? s.delete(idx) : s.add(idx); return s;
  });

  const keepIndices = pages.map((_, i) => i).filter(i =>
    mode === 'keep' ? marked.has(i) : !marked.has(i)
  );

  const handleExtract = async () => {
    if (!effectiveFile || keepIndices.length === 0) return;
    setIsProcessing(true); setError(null); setResultBlob(null);
    try {
      const ab = await effectiveFile.arrayBuffer();
      const orig = await PDFDocument.load(ab);
      const newPdf = await PDFDocument.create();
      const copied = await newPdf.copyPages(orig, keepIndices);
      copied.forEach(p => newPdf.addPage(p));
      const bytes = await newPdf.save();
      const blob = new Blob([bytes], { type: 'application/pdf' });
      setResultBlob(blob);
    } catch (e: any) { setError(e.message || 'Error al extraer páginas'); }
    finally { setIsProcessing(false); }
  };

  const allMarked = marked.size === pages.length;

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-5">
      <div className="flex items-center gap-3 pb-2 border-b border-gray-200">
        <div className="p-2 bg-blue-50 rounded-lg"><Scissors className="w-5 h-5 text-blue-600" /></div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Extraer Páginas</h1>
          <p className="text-sm text-gray-500">Selecciona visualmente las páginas a conservar o eliminar. 100% local.</p>
        </div>
      </div>

      {!effectiveFile ? (
        <Dropzone onFilesSelected={handleFileSelected} accept={{ 'application/pdf': ['.pdf'] }} multiple={false} />
      ) : (
        <>
          {/* Controls */}
          <div className="flex flex-wrap items-center gap-4 p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
            <span className="text-base font-semibold text-gray-700 truncate max-w-[200px]">{effectiveFileName}</span>
            <div className="flex rounded-md border border-gray-200 overflow-hidden text-sm font-medium">
              <button onClick={() => { setMode('keep'); setMarked(new Set()); }}
                className={`px-4 py-2 transition-colors ${mode === 'keep' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
                ✓ Conservar marcadas
              </button>
              <button onClick={() => { setMode('delete'); setMarked(new Set()); }}
                className={`px-4 py-2 transition-colors ${mode === 'delete' ? 'bg-red-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
                ✕ Eliminar marcadas
              </button>
            </div>
            {pages.length > 0 && (
              <button onClick={() => setMarked(allMarked ? new Set() : new Set(pages.map((_, i) => i)))}
                className="text-sm font-medium text-blue-600 hover:underline ml-auto">
                {allMarked ? 'Deseleccionar todo' : 'Seleccionar todo'}
              </button>
            )}
            {!workspaceFile && (
              <button onClick={() => { setLocalFile(null); setPages([]); }} className="text-sm font-medium text-red-500 hover:text-red-700">Cambiar</button>
            )}
          </div>

          {/* Instruction */}
          {pages.length > 0 && marked.size === 0 && (
            <div className={`flex items-center gap-2 p-2.5 rounded-lg text-xs ${mode === 'keep' ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-700'}`}>
              <span>{mode === 'keep' ? '👆 Haz clic en las páginas que deseas CONSERVAR.' : '👆 Haz clic en las páginas que deseas ELIMINAR.'}</span>
            </div>
          )}
          {pages.length > 0 && marked.size > 0 && (
            <div className={`flex items-center gap-2 p-2.5 rounded-lg text-xs font-medium ${keepIndices.length > 0 ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
              {keepIndices.length > 0 ? <CheckCircle className="w-4 h-4" /> : <span>⚠️</span>}
              <span>
                {keepIndices.length > 0
                  ? `Resultado: ${keepIndices.length} página${keepIndices.length > 1 ? 's' : ''} de ${pages.length}`
                  : 'Sin páginas para conservar — ajusta la selección'}
              </span>
            </div>
          )}

          {isLoading && (
            <div className="flex flex-col items-center py-10 gap-3">
              <Loader className="w-7 h-7 text-blue-500 animate-spin" />
              <div className="w-48 bg-gray-200 rounded-full h-1.5">
                <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-sm text-gray-500">Cargando páginas... {progress}%</p>
            </div>
          )}

          {!isLoading && pages.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {pages.map((page) => {
                const isMarked = marked.has(page.index);
                const isKept = mode === 'keep' ? isMarked : !isMarked;
                return (
                  <button
                    key={page.index}
                    onClick={() => toggle(page.index)}
                    className={[
                      'relative rounded-lg border-2 overflow-hidden transition-all duration-100 focus:outline-none bg-white',
                      isMarked && mode === 'keep' ? 'border-blue-500 shadow-lg shadow-blue-100 scale-[1.02]' : '',
                      isMarked && mode === 'delete' ? 'border-red-500 shadow-lg shadow-red-100 scale-[1.02]' : '',
                      !isMarked ? 'border-gray-200 hover:border-gray-300 hover:shadow-sm' : '',
                    ].join(' ')}
                  >
                    <div className="aspect-[0.707] bg-gray-50 overflow-hidden relative">
                      <img src={page.dataUrl} alt={`Pág ${page.index + 1}`}
                        className={`w-full h-full object-cover transition-opacity ${!isKept && marked.size > 0 ? 'opacity-25' : 'opacity-100'}`}
                        draggable={false}
                      />
                      {isMarked && mode === 'delete' && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="bg-red-500 rounded-full p-1.5 shadow">
                            <span className="text-white text-sm font-bold">✕</span>
                          </div>
                        </div>
                      )}
                      {isMarked && mode === 'keep' && (
                        <div className="absolute top-1.5 right-1.5">
                          <CheckCircle className="w-5 h-5 text-blue-500 bg-white rounded-full shadow" />
                        </div>
                      )}
                    </div>
                    <div className={`text-center text-[10px] font-medium py-1 transition-colors ${
                      isMarked && mode === 'keep' ? 'bg-blue-50 text-blue-700'
                      : isMarked && mode === 'delete' ? 'bg-red-50 text-red-700'
                      : 'bg-gray-50 text-gray-500'
                    }`}>
                      Pág. {page.index + 1}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Result actions */}
          {resultBlob && !isProcessing && (
            <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
              <p className="text-sm text-green-800 font-medium flex-1">
                ¡{keepIndices.length} página{keepIndices.length !== 1 ? 's' : ''} extraída{keepIndices.length !== 1 ? 's' : ''} correctamente!
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => downloadBlob(resultBlob, `extraido_${effectiveFileName}`)}>
                  Descargar
                </Button>
                {workspaceFile && (
                  <Button size="sm" onClick={async () => {
                    await ctx.replaceWithBlob(resultBlob, `extraido_${effectiveFileName}`);
                    setResultBlob(null); setPages([]); setMarked(new Set());
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
              <button onClick={() => setMarked(new Set())} disabled={marked.size === 0} className="text-base font-medium text-gray-600 hover:text-gray-900 disabled:opacity-30">
                Limpiar selección
              </button>
              <Button onClick={handleExtract} disabled={marked.size === 0 || keepIndices.length === 0 || isProcessing} size="lg">
                {isProcessing ? 'Generando...' : `Extraer (${keepIndices.length} pág${keepIndices.length !== 1 ? 's' : '.'})`}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default SplitTool;
