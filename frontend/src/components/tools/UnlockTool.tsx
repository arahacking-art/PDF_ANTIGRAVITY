import React, { useState } from 'react';
import { usePdfContext } from '../../context/PdfContext';
import { usePdfSecurity } from '../../hooks/usePdfSecurity';
import Dropzone from '../ui/Dropzone';
import Button from '../ui/Button';
import { LockOpen, FileText, CheckCircle } from 'lucide-react';

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
};

const UnlockTool: React.FC = () => {
  const ctx = usePdfContext();
  const workspaceFile = ctx.file;

  const [localFile, setLocalFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const { processWithPassword, isProcessing, error } = usePdfSecurity('unlock');

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

  const handleUnlock = async () => {
    if (!effectiveFile || !password) return;
    const blob = await processWithPassword(effectiveFile, password);
    if (blob) {
      setResultBlob(blob);
    }
  };

  const effectiveFileName = effectiveFile?.name || '';

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-5">
      <div className="flex items-center gap-3 pb-2 border-b border-gray-200">
        <div className="p-2 bg-blue-50 rounded-lg"><LockOpen className="w-5 h-5 text-blue-600" /></div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Quitar Contraseña de PDF</h1>
          <p className="text-sm text-gray-500">Elimina la protección de un PDF encriptado usando la contraseña original.</p>
        </div>
      </div>

      {!effectiveFile ? (
        <Dropzone onFilesSelected={(f) => { if (f[0]) { setLocalFile(f[0]); setResultBlob(null); } }} accept={{ 'application/pdf': ['.pdf'] }} multiple={false} />
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
          {/* File info bar */}
          {workspaceFile ? (
            <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <FileText className="w-4 h-4 text-blue-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-blue-800 truncate">{workspaceFile.name}</p>
                <p className="text-xs text-blue-600 mt-0.5">Desde Workspace · {formatBytes(workspaceFile.size)}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center gap-3">
                <LockOpen className="w-4 h-4 text-gray-400" />
                <span className="font-medium text-gray-800 truncate">{localFile!.name}</span>
              </div>
              <button onClick={() => { setLocalFile(null); setPassword(''); setResultBlob(null); }} className="text-red-500 hover:text-red-700 text-sm font-medium transition-colors ml-4">
                Cambiar
              </button>
            </div>
          )}

          {/* Password field */}
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">
              Contraseña actual del PDF
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                placeholder="Ingresa la contraseña del PDF"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors pr-20 bg-white text-gray-900"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
              >
                {showPassword ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
          </div>

          <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <span className="text-blue-500 mt-0.5">ℹ️</span>
            <p className="text-xs text-blue-700">
              Necesitas conocer la contraseña original del documento. Esta herramienta no rompe contraseñas desconocidas.
            </p>
          </div>

          {/* Result actions: Download + Replace in Workspace */}
          {resultBlob && (
            <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
              <p className="text-sm text-green-800 font-medium flex-1">¡Desbloqueado correctamente!</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => downloadBlob(resultBlob, `desbloqueado_${effectiveFileName}`)}>
                  Descargar
                </Button>
                {workspaceFile && (
                  <Button size="sm" onClick={async () => {
                    await ctx.replaceWithBlob(resultBlob, `desbloqueado_${effectiveFileName}`);
                    setResultBlob(null);
                    setPassword('');
                  }}>
                    Reemplazar en Workspace
                  </Button>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="p-4 text-sm text-red-700 bg-red-50 rounded-lg border border-red-200">
              {error}
            </div>
          )}

          <div className="flex justify-between items-center pt-2 border-t border-gray-100">
            {!workspaceFile ? (
              <Button variant="outline" onClick={() => { setLocalFile(null); setPassword(''); setResultBlob(null); }} disabled={isProcessing}>
                Cancelar
              </Button>
            ) : (
              <div />
            )}
            <Button onClick={handleUnlock} disabled={!password || isProcessing} size="lg">
              {isProcessing ? 'Desbloqueando...' : 'Quitar Contraseña'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default UnlockTool;
