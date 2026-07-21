import React, { useState, useCallback, useEffect } from 'react';
import { PDFDocument, rgb } from 'pdf-lib';
import { usePdfContext } from '../../context/PdfContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import Button from '../ui/Button';
import { Type, PenTool, CheckCircle, Loader, X } from 'lucide-react';

type TextAnnotation = { type: 'text'; text: string; x: number; y: number; pageIndex: number };
type PathAnnotation = { type: 'path'; points: {x: number, y: number}[]; pageIndex: number };
type Annotation = TextAnnotation | PathAnnotation;

type Mode = 'text' | 'draw' | null;

const AnnotateTool: React.FC = () => {
  const ctx = usePdfContext();
  const { setOverlayRenderer } = useWorkspace();
  const workspaceFile = ctx.file;

  const [mode, setMode] = useState<Mode>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [activeTextInput, setActiveTextInput] = useState<{x: number, y: number, pageIndex: number, text: string} | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState<{x: number, y: number}[]>([]);

  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);

  const commitText = useCallback(() => {
    if (activeTextInput && activeTextInput.text.trim()) {
      setAnnotations(prev => [...prev, {
        type: 'text',
        text: activeTextInput.text,
        x: activeTextInput.x,
        y: activeTextInput.y,
        pageIndex: activeTextInput.pageIndex
      }]);
    }
    setActiveTextInput(null);
  }, [activeTextInput]);

  const onPointerDown = useCallback((e: React.PointerEvent, pageIndex: number, dims: {width: number, height: number}) => {
    if (mode === 'text') {
      if (activeTextInput) {
        commitText();
      }
      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
      const x = (e.clientX - rect.left) / dims.width;
      const y = (e.clientY - rect.top) / dims.height;
      setActiveTextInput({ text: '', x, y, pageIndex });
    } else if (mode === 'draw') {
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      setIsDrawing(true);
      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
      const x = (e.clientX - rect.left) / dims.width;
      const y = (e.clientY - rect.top) / dims.height;
      setCurrentPath([{x, y}]);
    }
  }, [mode, activeTextInput, commitText]);

  const onPointerMove = useCallback((e: React.PointerEvent, _pageIndex: number, dims: {width: number, height: number}) => {
    if (mode === 'draw' && isDrawing) {
      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
      const x = (e.clientX - rect.left) / dims.width;
      const y = (e.clientY - rect.top) / dims.height;
      setCurrentPath(prev => [...prev, {x, y}]);
    }
  }, [mode, isDrawing]);

  const onPointerUp = useCallback((e: React.PointerEvent, pageIndex: number) => {
    if (mode === 'draw' && isDrawing) {
      setIsDrawing(false);
      (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
      if (currentPath.length > 0) {
        setAnnotations(prev => [...prev, { type: 'path', points: currentPath, pageIndex }]);
        setCurrentPath([]);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, isDrawing, currentPath]);

  const renderOverlay = useCallback((pageIndex: number, dims: { width: number; height: number }) => {
    return (
      <div 
        className="absolute inset-0 z-50 touch-none"
        style={{ cursor: mode === 'text' ? 'text' : mode === 'draw' ? 'crosshair' : 'default', pointerEvents: mode ? 'auto' : 'none' }}
        onPointerDown={e => onPointerDown(e, pageIndex, dims)}
        onPointerMove={e => onPointerMove(e, pageIndex, dims)}
        onPointerUp={e => onPointerUp(e, pageIndex)}
        onPointerCancel={e => onPointerUp(e, pageIndex)}
      >
        <svg className="absolute inset-0 pointer-events-none" width="100%" height="100%">
          {annotations.filter(a => a.pageIndex === pageIndex && a.type === 'path').map((a, i) => (
            <polyline 
              key={i} 
              points={(a as PathAnnotation).points.map(p => `${p.x * dims.width},${p.y * dims.height}`).join(' ')} 
              fill="none" 
              stroke="black" 
              strokeWidth={2} 
            />
          ))}
          {currentPath.length > 0 && mode === 'draw' && (
            <polyline 
              points={currentPath.map(p => `${p.x * dims.width},${p.y * dims.height}`).join(' ')} 
              fill="none" 
              stroke="black" 
              strokeWidth={2} 
            />
          )}
        </svg>

        {annotations.filter(a => a.pageIndex === pageIndex && a.type === 'text').map((a, i) => (
          <div 
            key={i} 
            className="absolute pointer-events-none text-black whitespace-nowrap font-sans"
            style={{
              left: `${(a as TextAnnotation).x * 100}%`,
              top: `${(a as TextAnnotation).y * 100}%`,
              fontSize: '16px'
            }}
          >
            {(a as TextAnnotation).text}
          </div>
        ))}

        {activeTextInput && activeTextInput.pageIndex === pageIndex && (
          <input
            autoFocus
            className="absolute bg-white border border-blue-500 shadow-sm outline-none text-black px-1 pointer-events-auto"
            style={{
              left: `${activeTextInput.x * 100}%`,
              top: `${activeTextInput.y * 100}%`,
              fontSize: '16px',
              transform: 'translateY(-2px)'
            }}
            value={activeTextInput.text}
            onChange={e => setActiveTextInput(prev => prev ? {...prev, text: e.target.value} : null)}
            onBlur={() => commitText()}
            onKeyDown={e => {
              if (e.key === 'Enter') commitText();
            }}
          />
        )}
      </div>
    );
  }, [mode, annotations, currentPath, activeTextInput, onPointerDown, onPointerMove, onPointerUp, commitText]);

  useEffect(() => {
    setOverlayRenderer(renderOverlay);
    return () => setOverlayRenderer(null);
  }, [renderOverlay, setOverlayRenderer]);

  const handleSubmit = async () => {
    if (!workspaceFile) return;
    setIsProcessing(true); setError(null); setResultBlob(null);
    try {
      const pdfAb = await workspaceFile.arrayBuffer();
      const pdfDoc = await PDFDocument.load(pdfAb);
      const pages = pdfDoc.getPages();

      for (const ann of annotations) {
        if (ann.pageIndex < 0 || ann.pageIndex >= pages.length) continue;
        const page = pages[ann.pageIndex];
        const { width, height } = page.getSize();

        if (ann.type === 'text') {
          page.drawText(ann.text, {
            x: ann.x * width,
            y: height - (ann.y * height) - 16,
            size: 16,
            color: rgb(0, 0, 0)
          });
        } else if (ann.type === 'path') {
          const svgPath = ann.points.map((p, i) => {
            const px = p.x * width;
            const py = height - (p.y * height);
            return `${i === 0 ? 'M' : 'L'} ${px} ${py}`;
          }).join(' ');
          
          if (svgPath) {
            page.drawSvgPath(svgPath, {
              x: 0,
              y: 0,
              borderColor: rgb(0, 0, 0),
              borderWidth: 2
            });
          }
        }
      }

      const bytes = await pdfDoc.save();
      const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
      setResultBlob(blob);
    } catch (e: any) { 
      setError(e.message || 'Error al anotar'); 
    } finally { 
      setIsProcessing(false); 
    }
  };

  const downloadBlob = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const clearAnnotations = () => {
    setAnnotations([]);
    setActiveTextInput(null);
    setCurrentPath([]);
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-5">
      <div className="flex items-center gap-3 pb-2 border-b border-gray-200">
        <div className="p-2 bg-purple-50 rounded-lg"><PenTool className="w-5 h-5 text-purple-600" /></div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Anotar PDF</h1>
          <p className="text-sm text-gray-500">Añade texto y dibuja a mano alzada. 100% en tu navegador.</p>
        </div>
      </div>

      {!workspaceFile ? (
        <div className="p-4 bg-yellow-50 text-yellow-700 rounded-lg border border-yellow-200">
          Por favor, abre un archivo PDF en el espacio de trabajo primero.
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Button 
              variant={mode === 'text' ? 'default' : 'outline'} 
              onClick={() => { setMode(mode === 'text' ? null : 'text'); setActiveTextInput(null); }}
              className="flex gap-2 items-center"
            >
              <Type className="w-4 h-4" /> Añadir Texto
            </Button>
            <Button 
              variant={mode === 'draw' ? 'default' : 'outline'} 
              onClick={() => { setMode(mode === 'draw' ? null : 'draw'); setActiveTextInput(null); }}
              className="flex gap-2 items-center"
            >
              <PenTool className="w-4 h-4" /> Dibujar
            </Button>
            {annotations.length > 0 && (
              <Button variant="outline" onClick={clearAnnotations} className="ml-auto text-red-600 border-red-200 hover:bg-red-50">
                <X className="w-4 h-4 mr-2" /> Limpiar Todo
              </Button>
            )}
          </div>

          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700">
            {mode === 'text' && <p>Haz clic en cualquier parte del PDF para añadir texto. Presiona Enter cuando termines.</p>}
            {mode === 'draw' && <p>Haz clic y arrastra en cualquier parte del PDF para dibujar.</p>}
            {!mode && <p>Selecciona una herramienta arriba para comenzar a anotar.</p>}
            <p className="mt-2 text-xs text-gray-500">Anotaciones actuales: {annotations.length}</p>
          </div>

          {resultBlob && !isProcessing && (
            <div className="flex flex-col gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                <p className="text-sm text-green-800 font-medium">¡Anotaciones aplicadas correctamente!</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => downloadBlob(resultBlob, `anotado_${ctx.fileName}`)}>
                  Descargar
                </Button>
                <Button size="sm" onClick={async () => {
                  await ctx.replaceWithBlob(resultBlob, `anotado_${ctx.fileName}`);
                  setResultBlob(null);
                }}>
                  Reemplazar en Workspace
                </Button>
              </div>
            </div>
          )}

          {error && <div className="p-3 text-sm text-red-700 bg-red-50 rounded-lg border border-red-200">{error}</div>}

          {!resultBlob && (
            <div className="flex justify-end pt-3 border-t border-gray-200 mt-4">
              <Button onClick={handleSubmit} disabled={isProcessing || annotations.length === 0} size="lg">
                {isProcessing ? <span className="flex items-center gap-2"><Loader className="w-4 h-4 animate-spin" />Procesando...</span> : 'Aplicar Anotaciones'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AnnotateTool;
