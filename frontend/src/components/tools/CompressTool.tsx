import React, { useState } from 'react';
import { usePdfContext } from '../../context/PdfContext';
import Dropzone from '../ui/Dropzone';
import Button from '../ui/Button';
import { Minimize2, Loader, CheckCircle, FileText } from 'lucide-react';

const BACKEND_URL = 'http://localhost:8000';

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
};

interface CompressionResult {
  originalSize: number;
  compressedSize: number;
  reductionPct: number;
}

const CompressTool: React.FC = () => {
  const ctx = usePdfContext();
  const workspaceFile = ctx.file;

  const [localFile, setLocalFile] = useState<File | null>(null);
  const [mode, setMode] = useState<'standard' | 'aggressive'>('standard');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CompressionResult | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);

  const effectiveFile = workspaceFile || localFile;

  const downloadBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCompress = async () => {
    if (!effectiveFile) return;
    setIsProcessing(true);
    setError(null);
    setResult(null);
    setResultBlob(null);

    try {
      const formData = new FormData();
      formData.append('file', effectiveFile);
      formData.append('mode', mode);

      const response = await fetch(`${BACKEND_URL}/api/compress`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: 'Error del servidor' }));
        throw new Error(err.detail || `Error ${response.status}`);
      }

      const originalSize = parseInt(response.headers.get('X-Original-Size') || '0', 10);
      const compressedSize = parseInt(response.headers.get('X-Compressed-Size') || '0', 10);
      const reductionPct = parseFloat(response.headers.get('X-Reduction-Percent') || '0');

      const blob = await response.blob();

      setResultBlob(blob);
      setResult({
        originalSize: originalSize || effectiveFile.size,
        compressedSize: compressedSize || blob.size,
        reductionPct: reductionPct,
      });
    } catch (err: any) {
      if (err instanceof TypeError) {
        setError('No se pudo conectar al servidor. Verifica que el backend esté activo.');
      } else {
        setError(err.message || 'Error inesperado al comprimir.');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const effectiveFileName = effectiveFile?.name || '';

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-5">
      <div className="flex items-center gap-3 pb-2 border-b border-gray-200">
        <div className="p-2 bg-blue-50 rounded-lg"><Minimize2 className="w-5 h-5 text-blue-600" /></div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Comprimir PDF</h1>
          <p className="text-sm text-gray-500">Reduce el tamaño de tu PDF usando estrategias avanzadas de optimización.</p>
        </div>
      </div>

      {!effectiveFile ? (
        <Dropzone
          onFilesSelected={(f) => { if (f[0]) { setLocalFile(f[0]); setResult(null); setResultBlob(null); setError(null); } }}
          accept={{ 'application/pdf': ['.pdf'] }}
          multiple={false}
        />
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 space-y-5">
          {/* File info bar */}
          {workspaceFile ? (
            <div className="flex items-center gap-3 p-3 bg-blue-50 rounded border border-blue-200">
              <FileText className="w-4 h-4 text-blue-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-blue-800 truncate">{workspaceFile.name}</p>
                <p className="text-xs text-blue-600 mt-0.5">Desde Workspace · {formatBytes(workspaceFile.size)}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded border border-gray-200">
              <div>
                <p className="font-medium text-sm text-gray-700 truncate max-w-sm">{localFile!.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">Tamaño original: <strong>{formatBytes(localFile!.size)}</strong></p>
              </div>
              <button onClick={() => { setLocalFile(null); setResult(null); setResultBlob(null); setError(null); }} className="text-red-500 hover:text-red-700 text-xs font-medium px-2 py-1 bg-white border border-gray-200 rounded">Cambiar archivo</button>
            </div>
          )}

          {/* Mode selector */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700">Modo de compresión</label>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setMode('standard')} className={`p-3 text-left border-2 rounded transition-all ${mode === 'standard' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className={`font-semibold text-sm ${mode === 'standard' ? 'text-blue-700' : 'text-gray-700'}`}>Estándar</span>
                  <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-bold">Sin pérdida</span>
                </div>
                <p className="text-xs text-gray-500">Comprime datos internos y fuentes. La calidad de las imágenes se mantiene intacta.</p>
              </button>
              <button onClick={() => setMode('aggressive')} className={`p-3 text-left border-2 rounded transition-all ${mode === 'aggressive' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className={`font-semibold text-sm ${mode === 'aggressive' ? 'text-blue-700' : 'text-gray-700'}`}>Agresivo</span>
                  <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-bold">Mayor reducción</span>
                </div>
                <p className="text-xs text-gray-500">Reduce la resolución de imágenes grandes y las recomprime. Ideal para PDFs pesados.</p>
              </button>
            </div>
          </div>

          {/* Result stats */}
          {result && (
            <div className={`p-3 rounded border ${result.reductionPct > 1 ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
              <div className="flex items-center gap-2 mb-2">
                {result.reductionPct > 1 ? <CheckCircle className="w-4 h-4 text-green-600" /> : <span className="text-yellow-600 text-sm">ℹ️</span>}
                <span className={`text-sm font-semibold ${result.reductionPct > 1 ? 'text-green-800' : 'text-yellow-800'}`}>
                  {result.reductionPct > 1 ? `PDF reducido un ${result.reductionPct.toFixed(1)}%` : 'Este PDF ya estaba muy optimizado'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center bg-white rounded border border-white/50 py-2">
                <div><p className="text-[10px] text-gray-500">Original</p><p className="text-xs font-bold">{formatBytes(result.originalSize)}</p></div>
                <div><p className="text-[10px] text-gray-500">Ahorro</p><p className={`text-xs font-bold ${result.reductionPct > 1 ? 'text-green-600' : 'text-gray-400'}`}>{result.reductionPct > 1 ? `- ${formatBytes(result.originalSize - result.compressedSize)}` : 'Sin cambio'}</p></div>
                <div><p className="text-[10px] text-gray-500">Resultado</p><p className="text-xs font-bold">{formatBytes(result.compressedSize)}</p></div>
              </div>
            </div>
          )}

          {/* Result actions: Download + Replace in Workspace */}
          {resultBlob && (
            <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
              <p className="text-sm text-green-800 font-medium flex-1">¡Comprimido correctamente!</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => downloadBlob(resultBlob, `comprimido_${effectiveFileName}`)}>
                  Descargar
                </Button>
                {workspaceFile && (
                  <Button size="sm" onClick={async () => {
                    await ctx.replaceWithBlob(resultBlob, `comprimido_${effectiveFileName}`);
                    setResultBlob(null);
                    setResult(null);
                  }}>
                    Reemplazar en Workspace
                  </Button>
                )}
              </div>
            </div>
          )}

          {error && <div className="p-3 text-sm text-red-700 bg-red-50 rounded border border-red-200">{error}</div>}

          <div className="flex justify-between items-center pt-2 border-t border-gray-100">
            {!workspaceFile ? (
              <button onClick={() => { setLocalFile(null); setResult(null); setResultBlob(null); }} disabled={isProcessing} className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50">Cancelar</button>
            ) : (
              <div />
            )}
            <Button onClick={handleCompress} disabled={isProcessing} size="lg">
              {isProcessing ? <span className="flex items-center gap-2"><Loader className="w-4 h-4 animate-spin" /> Comprimiendo...</span> : 'Comprimir PDF'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CompressTool;
