import React, { useState } from 'react';
import { usePdfRotate } from '../../hooks/usePdfRotate';
import { usePdfContext } from '../../context/PdfContext';
import Dropzone from '../ui/Dropzone';
import Button from '../ui/Button';
import { RotateCw, FileText, CheckCircle } from 'lucide-react';

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
};

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
};

const RotateTool: React.FC = () => {
  const ctx = usePdfContext();
  const workspaceFile = ctx.file;

  const [localFile, setLocalFile] = useState<File | null>(null);
  const [angle, setAngle] = useState<90 | 180 | 270>(90);
  const [scope, setScope] = useState<'all' | 'custom'>('all');
  const [pagesStr, setPagesStr] = useState('');
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const { rotatePdf, isProcessing, error } = usePdfRotate();

  const effectiveFile = workspaceFile || localFile;

  const handleRotate = async () => {
    if (!effectiveFile) return;
    setResultBlob(null);
    const pageScope = scope === 'all' ? 'all' : pagesStr.split(',').map(p => parseInt(p.trim(), 10)).filter(n => !isNaN(n));
    const blob = await rotatePdf(effectiveFile, angle, pageScope as 'all' | number[]);
    if (blob) setResultBlob(blob);
  };

  const downloadResult = () => {
    if (!resultBlob || !effectiveFile) return;
    downloadBlob(resultBlob, `rotado_${effectiveFile.name}`);
  };

  const handleClear = () => {
    setLocalFile(null);
    setResultBlob(null);
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-5">
      <div className="flex items-center gap-3 pb-2 border-b border-gray-200">
        <div className="p-2 bg-blue-50 rounded-lg"><RotateCw className="w-5 h-5 text-blue-600" /></div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Rotar PDF</h1>
          <p className="text-sm text-gray-500">Rota las páginas de tu PDF permanentemente. Procesado localmente.</p>
        </div>
      </div>

      {/* File source: workspace file info bar OR dropzone fallback */}
      {workspaceFile ? (
        <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <FileText className="w-5 h-5 text-blue-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-blue-900 truncate">{workspaceFile.name}</p>
            <p className="text-xs text-blue-600">{formatBytes(workspaceFile.size)} · Desde Workspace</p>
          </div>
        </div>
      ) : !localFile ? (
        <Dropzone onFilesSelected={(f) => f[0] && setLocalFile(f[0])} accept={{ 'application/pdf': ['.pdf'] }} multiple={false} />
      ) : null}

      {/* Options panel — shown when any file is available */}
      {effectiveFile && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
          {/* Show local file info bar (only if using local file, not workspace) */}
          {!workspaceFile && localFile && (
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <span className="font-medium text-gray-800 truncate flex-1">{localFile.name}</span>
              <button onClick={handleClear} className="text-red-500 hover:text-red-700 text-sm ml-4 transition-colors">Cambiar</button>
            </div>
          )}

          {/* Ángulo */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Ángulo de rotación</label>
            <div className="flex gap-3">
              {([90, 180, 270] as const).map((a) => (
                <button key={a} onClick={() => setAngle(a)}
                  className={`flex-1 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${angle === a ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'}`}>
                  {a === 90 ? '↻ 90°' : a === 180 ? '↕ 180°' : '↺ 270°'}
                </button>
              ))}
            </div>
          </div>

          {/* Páginas */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">¿Qué páginas rotar?</label>
            <div className="flex gap-3">
              {(['all', 'custom'] as const).map((s) => (
                <button key={s} onClick={() => setScope(s)}
                  className={`flex-1 py-2 rounded-lg border-2 text-sm font-medium transition-all ${scope === s ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500'}`}>
                  {s === 'all' ? 'Todas las páginas' : 'Páginas específicas'}
                </button>
              ))}
            </div>
            {scope === 'custom' && (
              <input type="text" value={pagesStr} onChange={(e) => setPagesStr(e.target.value)}
                placeholder="Ej: 1, 3, 5"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 transition-colors" />
            )}
          </div>

          {error && <div className="p-4 text-sm text-red-700 bg-red-100 rounded-lg">{error}</div>}

          {/* Result actions */}
          {resultBlob && (
            <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
              <p className="text-sm text-green-800 font-medium flex-1">¡Procesado correctamente!</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={downloadResult}>Descargar</Button>
                {workspaceFile && (
                  <Button size="sm" onClick={async () => {
                    await ctx.replaceWithBlob(resultBlob, `rotado_${effectiveFile.name}`);
                    setResultBlob(null);
                  }}>Reemplazar en Workspace</Button>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3">
            {!workspaceFile && (
              <Button variant="outline" onClick={handleClear} disabled={isProcessing}>Cancelar</Button>
            )}
            <Button onClick={handleRotate} disabled={isProcessing}>
              {isProcessing ? 'Rotando...' : 'Rotar PDF'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default RotateTool;
