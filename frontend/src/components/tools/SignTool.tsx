import React, { useState, useRef, useEffect, useCallback } from 'react';
import { PDFDocument } from 'pdf-lib';
import { usePdfContext } from '../../context/PdfContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { getViewSize, uprightRotation, viewToPdf } from '../../utils/pageGeometry';
import SignatureCreator from './SignatureCreator';
import Button from '../ui/Button';
import ResultActions from '../ui/ResultActions';
import { PenLine, Loader } from 'lucide-react';
import { downloadBlob } from '../../utils/download';

interface SigPos { x: number; y: number; w: number; h: number; }

/**
 * Rectángulo que ocupa la imagen dentro de la caja de la firma, como object-fit: contain
 * (así lo que se dibuja en el PDF coincide con la vista previa). Todo en proporciones 0-1.
 */
function containedRect(box: SigPos, imgAspect: number, view: { width: number; height: number }): SigPos {
  const boxW = box.w * view.width;
  const boxH = box.h * view.height;
  if (boxW / boxH > imgAspect) {
    const w = (boxH * imgAspect) / view.width;
    return { x: box.x + (box.w - w) / 2, y: box.y, w, h: box.h };
  }
  const h = boxW / imgAspect / view.height;
  return { x: box.x, y: box.y + (box.h - h) / 2, w: box.w, h };
}

const SignTool: React.FC = () => {
  const ctx = usePdfContext();
  const { setOverlayRenderer } = useWorkspace();
  const workspaceFile = ctx.file;

  // Firma elegida como PNG (data URL), creada o recuperada en SignatureCreator
  const [sigDataUrl, setSigDataUrl] = useState<string | null>(null);
  const [selectedPage, setSelectedPage] = useState(0);
  const [sigPos, setSigPos] = useState<SigPos>({ x: 0.6, y: 0.75, w: 0.28, h: 0.09 });
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);

  const draggingRef = useRef<{ mx: number; my: number; sx: number; sy: number } | null>(null);
  const resizingRef = useRef<{ mx: number; my: number; sw: number; sh: number } | null>(null);

  /** Al elegir firma, ajusta la caja a su proporción para que quede ceñida. */
  const handleSigSelected = (dataUrl: string) => {
    const img = new Image();
    img.onload = () => {
      const page = ctx.pageInfos[selectedPage];
      const pageAspect = page ? page.width / page.height : 0.75;
      const w = 0.28;
      const h = Math.min(0.3, (w * pageAspect) / (img.naturalWidth / img.naturalHeight));
      setSigPos({ x: 0.6, y: Math.min(0.75, 1 - h - 0.02), w, h });
      setSigDataUrl(dataUrl);
      setResultBlob(null);
    };
    img.src = dataUrl;
  };

  const onSigMouseDown = (e: React.MouseEvent, pageDims: {width: number, height: number}) => {
    e.preventDefault(); e.stopPropagation();
    draggingRef.current = { mx: e.clientX, my: e.clientY, sx: sigPos.x, sy: sigPos.y };
    
    const move = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      const sx = draggingRef.current.sx;
      const sy = draggingRef.current.sy;
      const { width, height } = pageDims;
      const dx = (ev.clientX - draggingRef.current.mx) / width;
      const dy = (ev.clientY - draggingRef.current.my) / height;
      setSigPos(p => ({
        ...p,
        x: Math.max(0, Math.min(1 - p.w, sx + dx)),
        y: Math.max(0, Math.min(1 - p.h, sy + dy)),
      }));
    };
    const up = () => { 
      draggingRef.current = null; 
      document.removeEventListener('mousemove', move); 
      document.removeEventListener('mouseup', up); 
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };

  const onResizeMouseDown = (e: React.MouseEvent, pageDims: {width: number, height: number}) => {
    e.preventDefault(); e.stopPropagation();
    resizingRef.current = { mx: e.clientX, my: e.clientY, sw: sigPos.w, sh: sigPos.h };
    
    const move = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const sw = resizingRef.current.sw;
      const sh = resizingRef.current.sh;
      const { width, height } = pageDims;
      const dw = (ev.clientX - resizingRef.current.mx) / width;
      const dh = (ev.clientY - resizingRef.current.my) / height;
      setSigPos(p => ({
        ...p,
        w: Math.max(0.05, Math.min(1 - p.x, sw + dw)),
        h: Math.max(0.03, Math.min(1 - p.y, sh + dh)),
      }));
    };
    const up = () => { 
      resizingRef.current = null; 
      document.removeEventListener('mousemove', move); 
      document.removeEventListener('mouseup', up); 
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };

  const renderOverlay = useCallback((pageIndex: number, dims: { width: number; height: number }) => {
    if (!sigDataUrl) return null;

    if (pageIndex !== selectedPage) {
      return (
        <div 
          className="absolute inset-0 z-50 cursor-pointer hover:bg-blue-500/10 transition-colors pointer-events-auto flex items-center justify-center group"
          onClick={() => setSelectedPage(pageIndex)}
        >
          <div className="bg-blue-600 text-white px-3 py-1.5 rounded-full text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity shadow-lg pointer-events-none">
            Hacer clic para firmar aquí
          </div>
        </div>
      );
    }

    return (
      <div className="absolute inset-0 z-50 pointer-events-none" style={{ width: dims.width, height: dims.height }}>
        <div
          className="absolute border-2 border-blue-500 cursor-grab active:cursor-grabbing pointer-events-auto"
          style={{ 
            left: `${sigPos.x * 100}%`, 
            top: `${sigPos.y * 100}%`, 
            width: `${sigPos.w * 100}%`, 
            height: `${sigPos.h * 100}%` 
          }}
          onMouseDown={(e) => onSigMouseDown(e, dims)}
        >
          <img src={sigDataUrl} alt="Firma" className="w-full h-full object-contain pointer-events-none" draggable={false} />
          <div 
            className="absolute -bottom-2 -right-2 w-4 h-4 bg-blue-500 rounded-full cursor-se-resize border-2 border-white shadow z-10 pointer-events-auto" 
            onMouseDown={(e) => onResizeMouseDown(e, dims)} 
          />
          <div className="absolute -top-5 left-0 text-[10px] bg-blue-500 text-white px-1.5 py-0.5 rounded whitespace-nowrap shadow pointer-events-none">
            ↕↔ Arrastrar
          </div>
        </div>
      </div>
    );
  }, [selectedPage, sigDataUrl, sigPos]);

  useEffect(() => {
    setOverlayRenderer(renderOverlay);
    return () => setOverlayRenderer(null);
  }, [renderOverlay, setOverlayRenderer]);

  const handleSubmit = async () => {
    if (!workspaceFile || !sigDataUrl) return;
    setIsProcessing(true); setError(null); setResultBlob(null);
    try {
      const pdfAb = await workspaceFile.arrayBuffer();
      const pdfDoc = await PDFDocument.load(pdfAb);
      const pages = pdfDoc.getPages();
      if (selectedPage < 0 || selectedPage >= pages.length) {
        throw new Error('Página seleccionada inválida');
      }
      const page = pages[selectedPage];

      const img = await pdfDoc.embedPng(sigDataUrl);

      // sigPos está en proporciones de la página tal como se ve (rotación y CropBox
      // aplicados). El ancla de drawImage es la esquina inferior-izquierda de la firma
      // en la vista; la imagen se rota para compensar el /Rotate de la página.
      const view = getViewSize(page);
      const fit = containedRect(sigPos, img.width / img.height, view);
      const anchor = viewToPdf(page, fit.x, fit.y + fit.h);
      page.drawImage(img, {
        x: anchor.x,
        y: anchor.y,
        width: fit.w * view.width,
        height: fit.h * view.height,
        rotate: uprightRotation(page),
      });

      const bytes = await pdfDoc.save();
      const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
      setResultBlob(blob);
    } catch (e: any) { setError(e.message || 'Error al firmar'); }
    finally { setIsProcessing(false); }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-5">
      <div className="flex items-center gap-3 pb-2 border-b border-gray-200">
        <div className="p-2 bg-blue-50 rounded-lg"><PenLine className="w-5 h-5 text-blue-600" /></div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Firmar PDF</h1>
          <p className="text-sm text-gray-500">Arrastra y posiciona tu firma. 100% procesado en tu navegador.</p>
        </div>
      </div>

      {!workspaceFile ? (
        <div className="p-4 bg-yellow-50 text-yellow-700 rounded-lg border border-yellow-200">
          Por favor, abre un archivo PDF en el espacio de trabajo primero.
        </div>
      ) : (
        <div className="space-y-4">
          {!sigDataUrl ? (
            <SignatureCreator onSelect={handleSigSelected} />
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600">Página a firmar:</label>
                  <select value={selectedPage} onChange={e => setSelectedPage(parseInt(e.target.value))}
                    className="text-sm border border-gray-300 rounded px-2 py-1 bg-white">
                    {Array.from({ length: ctx.numPages || 1 }).map((_, i) => (
                      <option key={i} value={i}>Página {i + 1}</option>
                    ))}
                  </select>
                </div>
                
                <div className="flex flex-col gap-2">
                  <span className="text-sm text-gray-600">Firma seleccionada:</span>
                  <div className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <img src={sigDataUrl} alt="Firma" className="paper h-12 object-contain bg-white rounded px-2" />
                    <button onClick={() => { setSigDataUrl(null); setResultBlob(null); }} className="text-sm text-blue-600 hover:underline ml-auto">
                      Cambiar firma
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 p-2.5 bg-blue-50 rounded-lg">
                  <span className="text-blue-500 text-sm">✋</span>
                  <p className="text-xs text-blue-700"><strong>Arrastra</strong> la firma en el visor central para moverla. <strong>Esquina inferior derecha</strong> para redimensionar.</p>
                </div>
              </div>

              {resultBlob && !isProcessing && (
                <ResultActions
                  title="¡Firma aplicada correctamente!"
                  onDownload={() => downloadBlob(resultBlob, `firmado_${ctx.fileName}`)}
                  onApply={async () => {
                    await ctx.replaceWithBlob(resultBlob);
                    setResultBlob(null);
                  }}
                />
              )}

              {error && <div className="p-3 text-sm text-red-700 bg-red-50 rounded-lg border border-red-200">{error}</div>}

              {!resultBlob && (
                <div className="flex justify-end pt-3 border-t border-gray-200 mt-4">
                  <Button onClick={handleSubmit} disabled={isProcessing} size="lg">
                    {isProcessing ? <span className="flex items-center gap-2"><Loader className="w-4 h-4 animate-spin" />Firmando...</span> : 'Aplicar firma'}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SignTool;
