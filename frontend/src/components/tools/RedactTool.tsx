import React, { useState, useEffect } from 'react';
import { BACKEND_URL } from '../../config/api';
import { usePdfContext } from '../../context/PdfContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { removeCachedThumbnails } from '../../utils/thumbnailCache';
import Button from '../ui/Button';
import ResultActions from '../ui/ResultActions';
import { EyeOff, Trash2, Info } from 'lucide-react';
import { downloadBlob } from '../../utils/download';

let rectCounter = 0;

interface RedactRect {
  id: string; pageIndex: number;
  x1r: number; y1r: number; x2r: number; y2r: number;
}

interface Drawing {
  pageIndex: number;
  startX: number; startY: number;
  currentX: number; currentY: number;
  imgW: number; imgH: number;
}

const PageOverlay = ({ 
  pageIndex, dims, rects, setRects 
}: { 
  pageIndex: number, 
  dims: {width: number, height: number}, 
  rects: RedactRect[], 
  setRects: React.Dispatch<React.SetStateAction<RedactRect[]>> 
}) => {
  const [drawing, setDrawing] = useState<Drawing | null>(null);
  
  const getPos = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, imgW: r.width, imgH: r.height };
  };

  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const pos = getPos(e);
    setDrawing({ pageIndex, startX: pos.x, startY: pos.y, currentX: pos.x, currentY: pos.y, imgW: pos.imgW, imgH: pos.imgH });
  };

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!drawing) return;
    const pos = getPos(e);
    setDrawing(d => d ? { ...d, currentX: pos.x, currentY: pos.y } : null);
  };

  const onMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!drawing) return;
    const pos = getPos(e);
    const x1 = Math.min(drawing.startX, pos.x), y1 = Math.min(drawing.startY, pos.y);
    const x2 = Math.max(drawing.startX, pos.x), y2 = Math.max(drawing.startY, pos.y);
    if (x2 - x1 < 8 || y2 - y1 < 8) { setDrawing(null); return; }
    
    setRects(prev => [...prev, {
      id: `r${++rectCounter}`, pageIndex,
      x1r: x1 / pos.imgW, y1r: y1 / pos.imgH, x2r: x2 / pos.imgW, y2r: y2 / pos.imgH
    }]);
    setDrawing(null);
  };
  
  const pageRects = rects.filter(r => r.pageIndex === pageIndex);
  
  const drawBox = drawing
    ? { x: Math.min(drawing.startX, drawing.currentX), y: Math.min(drawing.startY, drawing.currentY), w: Math.abs(drawing.currentX - drawing.startX), h: Math.abs(drawing.currentY - drawing.startY) }
    : null;

  return (
    <div 
      className="absolute inset-0 cursor-crosshair z-10"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={(e) => { if (drawing) onMouseUp(e); }}
    >
      {pageRects.map(rect => (
        <div key={rect.id}
          className="absolute bg-black group flex items-center justify-center pointer-events-auto"
          style={{ 
            left: rect.x1r * dims.width, 
            top: rect.y1r * dims.height, 
            width: (rect.x2r - rect.x1r) * dims.width, 
            height: (rect.y2r - rect.y1r) * dims.height 
          }}>
          <button onClick={(e) => {
              e.stopPropagation();
              setRects(prev => prev.filter(r => r.id !== rect.id));
            }}
            className="opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 rounded-full p-0.5 shadow cursor-pointer">
            <Trash2 className="w-3 h-3 text-white" />
          </button>
        </div>
      ))}
      
      {drawBox && (
        <div className="absolute border-2 border-red-500 bg-red-500/25 pointer-events-none"
          style={{ left: drawBox.x, top: drawBox.y, width: drawBox.w, height: drawBox.h }} />
      )}
    </div>
  );
};

const RedactTool: React.FC = () => {
  const ctx = usePdfContext();
  const workspaceFile = ctx.file;
  const { setOverlayRenderer } = useWorkspace();

  const [rects, setRects] = useState<RedactRect[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);

  useEffect(() => {
    if (workspaceFile && !resultBlob) {
      setOverlayRenderer((pageIndex: number, dims: {width: number, height: number}) => (
        <PageOverlay 
          key={`overlay-${pageIndex}`}
          pageIndex={pageIndex} 
          dims={dims} 
          rects={rects} 
          setRects={setRects} 
        />
      ));
    } else {
      setOverlayRenderer(null);
    }
    
    return () => setOverlayRenderer(null);
  }, [rects, workspaceFile, resultBlob, setOverlayRenderer]);

  /**
   * La censura se aplica en el backend (PyMuPDF apply_redactions), que ELIMINA el texto,
   * las imágenes y los vectores bajo cada área. Dibujar rectángulos negros con pdf-lib
   * solo tapaba el contenido: seguía pudiéndose copiar, buscar o extraer.
   * Las áreas viajan como proporciones de la página tal como se ve en el visor.
   */
  const handleSubmit = async () => {
    if (!workspaceFile || rects.length === 0) return;
    setIsProcessing(true); setError(null); setResultBlob(null);
    try {
      const areas = rects.map(({ pageIndex, x1r, y1r, x2r, y2r }) => ({ page: pageIndex, x1r, y1r, x2r, y2r }));
      const formData = new FormData();
      formData.append('file', workspaceFile);
      formData.append('areas', JSON.stringify(areas));

      const response = await fetch(`${BACKEND_URL}/api/redact-visual`, { method: 'POST', body: formData });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({ detail: `Error ${response.status}` }));
        throw new Error(errData.detail || `Error del servidor: ${response.status}`);
      }
      setResultBlob(await response.blob());
      // Las miniaturas cacheadas del original muestran lo que se acaba de censurar.
      if (ctx.arrayBuffer) await removeCachedThumbnails(ctx.arrayBuffer);
    } catch (e: any) {
      if (e instanceof TypeError && e.message === 'Failed to fetch') {
        setError('No se pudo conectar al servidor. Verifica que el backend esté activo.');
      } else {
        setError(e.message || 'Error al censurar');
      }
    }
    finally { setIsProcessing(false); }
  };

  const downloadResult = () => {
    if (!resultBlob || !workspaceFile) return;
    downloadBlob(resultBlob, `censurado_${workspaceFile.name}`);
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-5">
      <div className="flex items-center gap-3 pb-2 border-b border-gray-200">
        <div className="p-2 bg-blue-50 rounded-lg"><EyeOff className="w-5 h-5 text-blue-600" /></div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Censurar PDF</h1>
          <p className="text-sm text-gray-500">Dibuja áreas sobre el PDF en el visor central. Su contenido se elimina definitivamente en el servidor interno.</p>
        </div>
      </div>

      {!workspaceFile ? (
        <div className="p-4 bg-gray-50 text-gray-600 rounded-lg text-sm border border-gray-200 flex items-center gap-2">
          <Info className="w-5 h-5 text-gray-400" />
          Abre un archivo PDF en el visor central para comenzar.
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between px-3 py-2 bg-white rounded-lg border border-gray-200 shadow-sm">
            <span className="text-sm font-medium text-gray-700 truncate max-w-xs">{workspaceFile.name}</span>
            <div className="flex items-center gap-3">
              {rects.length > 0 && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">{rects.length} área{rects.length > 1 ? 's' : ''}</span>}
              <span className="text-xs text-blue-600 font-medium px-2 py-1 bg-blue-50 border border-blue-200 rounded">Documento abierto</span>
            </div>
          </div>

          {!resultBlob && (
            <div className="flex items-center gap-2 p-2.5 bg-blue-50 rounded-lg">
              <span className="text-blue-500 text-sm">✏️</span>
              <p className="text-xs text-blue-700"><strong>Haz clic y arrastra</strong> sobre el PDF en el visor central para crear áreas de censura. Pasa el cursor sobre un área para eliminarla.</p>
            </div>
          )}

          {resultBlob && (
            <ResultActions
              title="¡Censura aplicada!"
              onDownload={downloadResult}
              onApply={workspaceFile ? async () => {
                await ctx.replaceWithBlob(resultBlob);
                setResultBlob(null);
                setRects([]);
              } : undefined}
            />
          )}

          {error && <div className="p-3 text-sm text-red-700 bg-red-50 rounded-lg border border-red-200">{error}</div>}

          {!resultBlob && (
            <div className="flex items-center justify-between pt-3 border-t border-gray-200">
              <button onClick={() => setRects([])} disabled={rects.length === 0} className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-30">
                Limpiar áreas
              </button>
              <Button onClick={handleSubmit} disabled={rects.length === 0 || isProcessing} size="lg">
                {isProcessing ? 'Aplicando...' : `Censurar (${rects.length} área${rects.length !== 1 ? 's' : ''})`}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default RedactTool;
