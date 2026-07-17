import React, { useState, useEffect } from 'react';
import { usePdfWatermark, type WatermarkOptions } from '../../hooks/usePdfWatermark';
import { usePdfContext } from '../../context/PdfContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import Button from '../ui/Button';
import { Droplets, CheckCircle } from 'lucide-react';

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
};

const WatermarkTool: React.FC = () => {
  const ctx = usePdfContext();
  const workspaceFile = ctx.file;
  const { setOverlayRenderer } = useWorkspace();

  const [opts, setOpts] = useState<WatermarkOptions>({
    text: 'CONFIDENCIAL',
    opacity: 0.25,
    fontSize: 60,
    rotation: 45,
    color: 'gray',
    position: 'center',
  });
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const { addWatermark, isProcessing, error } = usePdfWatermark();

  useEffect(() => {
    setOverlayRenderer(() => (pageIndex: number, dims: { width: number; height: number }) => {
      const { text, color, opacity, position, fontSize, rotation } = opts;
      const isCenter = position === 'center';
      const colorMap = { gray: '#9ca3af', red: '#ef4444', blue: '#3b82f6' };
      const colorValue = colorMap[color as keyof typeof colorMap] || 'gray';

      return (
        <div
          className="absolute inset-0 pointer-events-none overflow-hidden flex items-center justify-center"
          style={{ zIndex: 10 }}
        >
          {isCenter ? (
            <div
              style={{
                color: colorValue,
                opacity,
                fontSize: `${fontSize}px`,
                transform: `rotate(-${rotation}deg)`,
                whiteSpace: 'nowrap',
                fontWeight: 'bold',
              }}
            >
              {text}
            </div>
          ) : (
            <div
              className="absolute w-[200%] h-[200%] flex flex-wrap items-center justify-center content-center"
              style={{
                transform: `rotate(-${rotation}deg)`,
                color: colorValue,
                opacity,
                fontSize: `${fontSize}px`,
                fontWeight: 'bold',
                gap: '3rem',
                left: '-50%',
                top: '-50%'
              }}
            >
              {Array.from({ length: 100 }).map((_, i) => (
                <span key={i}>{text}</span>
              ))}
            </div>
          )}
        </div>
      );
    });

    return () => {
      setOverlayRenderer(null);
    };
  }, [opts, setOverlayRenderer]);

  const handleApply = async () => {
    if (!workspaceFile || !opts.text.trim()) return;
    setResultBlob(null);
    const blob = await addWatermark(workspaceFile, opts);
    if (blob) setResultBlob(blob);
  };

  const downloadResult = () => {
    if (!resultBlob || !workspaceFile) return;
    downloadBlob(resultBlob, `marcado_${workspaceFile.name}`);
  };

  if (!workspaceFile) {
    return (
      <div className="p-6 text-center text-gray-500">
        No hay ningún archivo abierto en el Workspace.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 pb-2 border-b border-gray-200">
        <div className="p-2 bg-blue-50 rounded-lg"><Droplets className="w-5 h-5 text-blue-600" /></div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Marca de Agua</h1>
          <p className="text-sm text-gray-500">Ajusta la marca y previsualízala en tiempo real.</p>
        </div>
      </div>

      <div className="space-y-5">
        {/* Texto */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">Texto de la marca</label>
          <input type="text" value={opts.text} onChange={(e) => setOpts({ ...opts, text: e.target.value })}
            placeholder="Ej: CONFIDENCIAL, BORRADOR..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 transition-colors" />
        </div>

        {/* Color */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">Color</label>
          <div className="flex gap-2">
            {(['gray', 'red', 'blue'] as const).map((c) => (
              <button key={c} onClick={() => setOpts({ ...opts, color: c })}
                className={`flex-1 py-2 rounded-lg border-2 text-xs font-semibold transition-all capitalize ${opts.color === c ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                {c === 'gray' ? 'Gris' : c === 'red' ? 'Rojo' : 'Azul'}
              </button>
            ))}
          </div>
        </div>

        {/* Posición */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">Disposición</label>
          <div className="flex gap-2">
            {(['center', 'tiled'] as const).map((p) => (
              <button key={p} onClick={() => setOpts({ ...opts, position: p })}
                className={`flex-1 py-2 rounded-lg border-2 text-xs font-semibold transition-all ${opts.position === p ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                {p === 'center' ? 'Centrado' : 'En mosaico'}
              </button>
            ))}
          </div>
        </div>

        {/* Opacidad */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">Opacidad: {Math.round(opts.opacity * 100)}%</label>
          <input type="range" min={5} max={80} value={Math.round(opts.opacity * 100)}
            onChange={(e) => setOpts({ ...opts, opacity: parseInt(e.target.value) / 100 })}
            className="w-full accent-blue-600" />
        </div>

        {/* Tamaño fuente */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">Tamaño: {opts.fontSize}pt</label>
          <input type="range" min={20} max={120} value={opts.fontSize}
            onChange={(e) => setOpts({ ...opts, fontSize: parseInt(e.target.value) })}
            className="w-full accent-blue-600" />
        </div>

        {error && <div className="p-4 text-sm text-red-700 bg-red-50 rounded-lg border border-red-200">{error}</div>}

        {/* Result actions */}
        {resultBlob && (
          <div className="flex flex-col gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
              <p className="text-sm text-green-800 font-medium">¡Procesado correctamente!</p>
            </div>
            <div className="flex flex-col gap-2">
              <Button variant="outline" size="sm" onClick={downloadResult} className="w-full justify-center">Descargar</Button>
              <Button size="sm" onClick={async () => {
                await ctx.replaceWithBlob(resultBlob, `marcado_${workspaceFile.name}`);
                setResultBlob(null);
              }} className="w-full justify-center">Reemplazar en Workspace</Button>
            </div>
          </div>
        )}

        <div className="pt-2 border-t border-gray-100">
          <Button onClick={handleApply} disabled={!opts.text.trim() || isProcessing} size="lg" className="w-full justify-center">
            {isProcessing ? 'Aplicando...' : 'Aplicar Marca de Agua'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default WatermarkTool;
