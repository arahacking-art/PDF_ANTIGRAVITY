import React, { useState, useRef, useEffect, useCallback } from 'react';
import { PDFDocument } from 'pdf-lib';
import { usePdfContext } from '../../context/PdfContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import Dropzone from '../ui/Dropzone';
import Button from '../ui/Button';
import { PenLine, Loader, CheckCircle } from 'lucide-react';

const downloadBlob = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
};

interface SigPos { x: number; y: number; w: number; h: number; }

const SignTool: React.FC = () => {
  const ctx = usePdfContext();
  const { setOverlayRenderer } = useWorkspace();
  const workspaceFile = ctx.file;

  const [sigFile, setSigFile] = useState<File | null>(null);
  const [sigDataUrl, setSigDataUrl] = useState<string | null>(null);
  const [selectedPage, setSelectedPage] = useState(0);
  const [sigPos, setSigPos] = useState<SigPos>({ x: 0.6, y: 0.75, w: 0.28, h: 0.09 });
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);

  const draggingRef = useRef<{ mx: number; my: number; sx: number; sy: number } | null>(null);
  const resizingRef = useRef<{ mx: number; my: number; sw: number; sh: number } | null>(null);

  const handleSigSelected = (files: File[]) => {
    if (!files[0]) return;
    setSigFile(files[0]);
    const reader = new FileReader();
    reader.onloadend = () => { setSigDataUrl(reader.result as string); };
    reader.readAsDataURL(files[0]);
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
    if (!workspaceFile || !sigFile || !sigDataUrl) return;
    setIsProcessing(true); setError(null); setResultBlob(null);
    try {
      const pdfAb = await workspaceFile.arrayBuffer();
      const sigAb = await sigFile.arrayBuffer();
      const pdfDoc = await PDFDocument.load(pdfAb);
      const pages = pdfDoc.getPages();
      if (selectedPage < 0 || selectedPage >= pages.length) {
        throw new Error('Página seleccionada inválida');
      }
      const page = pages[selectedPage];
      const { width, height } = page.getSize();

      let img;
      if (sigFile.type === 'image/png') {
        img = await pdfDoc.embedPng(sigAb);
      } else {
        img = await pdfDoc.embedJpg(sigAb);
      }

      const x = sigPos.x * width;
      const h = sigPos.h * height;
      const y = height - (sigPos.y * height) - h;
      const w = sigPos.w * width;

      page.drawImage(img, { x, y, width: w, height: h });

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
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-gray-600">Sube tu imagen de firma (PNG recomendado con fondo transparente)</h2>
              <Dropzone onFilesSelected={handleSigSelected} accept={{ 'image/png': ['.png'], 'image/jpeg': ['.jpg','.jpeg'] }} multiple={false} />
            </div>
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
                    <img src={sigDataUrl} alt="Firma" className="h-12 object-contain" />
                    <button onClick={() => { setSigFile(null); setSigDataUrl(null); }} className="text-sm text-red-600 hover:underline ml-auto">
                      Eliminar
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 p-2.5 bg-blue-50 rounded-lg">
                  <span className="text-blue-500 text-sm">✋</span>
                  <p className="text-xs text-blue-700"><strong>Arrastra</strong> la firma en el visor central para moverla. <strong>Esquina inferior derecha</strong> para redimensionar.</p>
                </div>
              </div>

              {resultBlob && !isProcessing && (
                <div className="flex flex-col gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                    <p className="text-sm text-green-800 font-medium">¡Firma aplicada correctamente!</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => downloadBlob(resultBlob, `firmado_${ctx.fileName}`)}>
                      Descargar
                    </Button>
                    <Button size="sm" onClick={async () => {
                      await ctx.replaceWithBlob(resultBlob, `firmado_${ctx.fileName}`);
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
