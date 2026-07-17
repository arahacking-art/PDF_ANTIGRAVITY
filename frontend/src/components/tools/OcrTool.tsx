import React, { useState } from 'react';
import { usePdfContext } from '../../context/PdfContext';
import Dropzone from '../ui/Dropzone';
import Button from '../ui/Button';
import { ScanText, Loader, CheckCircle, FileText } from 'lucide-react';

const BACKEND_URL = 'http://localhost:8000';

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
};

const LANGUAGES = [
  { code: 'spa+eng', label: '🇪🇸🇺🇸 Español + Inglés (recomendado)' },
  { code: 'spa',     label: '🇪🇸 Solo Español' },
  { code: 'eng',     label: '🇺🇸 Solo Inglés' },
  { code: 'fra',     label: '🇫🇷 Francés' },
  { code: 'deu',     label: '🇩🇪 Alemán' },
  { code: 'por',     label: '🇧🇷 Portugués' },
];

const OcrTool: React.FC = () => {
  const ctx = usePdfContext();
  const workspaceFile = ctx.file;

  const [localFile, setLocalFile] = useState<File | null>(null);
  const [language, setLanguage] = useState('spa+eng');
  const [deskew, setDeskew] = useState(true);
  const [forceOcr, setForceOcr] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ originalSize: number; resultSize: number } | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [alreadyHasText, setAlreadyHasText] = useState(false);

  const effectiveFile = workspaceFile || localFile;

  const handleProcess = async (forced = false) => {
    if (!effectiveFile) return;
    setIsProcessing(true); setError(null); setResult(null); setResultBlob(null); setAlreadyHasText(false);
    try {
      const formData = new FormData();
      formData.append('file', effectiveFile);
      formData.append('language', language);
      formData.append('deskew', deskew.toString());

      const endpoint = (forced || forceOcr) ? '/api/ocr-force' : '/api/ocr';
      const response = await fetch(`${BACKEND_URL}${endpoint}`, { method: 'POST', body: formData });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: `Error ${response.status}` }));
        if (response.status === 409) {
          setAlreadyHasText(true); setError(err.detail); return;
        }
        throw new Error(err.detail || `Error del servidor: ${response.status}`);
      }

      const originalSize = parseInt(response.headers.get('X-Original-Size') || '0', 10);
      const resultSize = parseInt(response.headers.get('X-Result-Size') || '0', 10);
      const blob = await response.blob();
      setResultBlob(blob);
      setResult({ originalSize: originalSize || effectiveFile.size, resultSize: resultSize || blob.size });
    } catch (err: any) {
      setError(err instanceof TypeError ? 'No se pudo conectar al servidor.' : (err.message || 'Error inesperado.'));
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadResult = () => {
    if (!resultBlob || !effectiveFile) return;
    const url = URL.createObjectURL(resultBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = effectiveFile.name.replace(/\.pdf$/i, '_OCR.pdf');
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    setLocalFile(null);
    setResult(null);
    setResultBlob(null);
    setError(null);
    setAlreadyHasText(false);
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-5">
      <div className="flex items-center gap-3 pb-2 border-b border-gray-200">
        <div className="p-2 bg-blue-50 rounded-lg"><ScanText className="w-5 h-5 text-blue-600" /></div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">OCR — Hacer PDF Buscable</h1>
          <p className="text-sm text-gray-500">Convierte un PDF escaneado a texto seleccionable.</p>
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
        <Dropzone onFilesSelected={(f) => { if (f[0]) { setLocalFile(f[0]); setResult(null); setResultBlob(null); setError(null); setAlreadyHasText(false); } }} accept={{ 'application/pdf': ['.pdf'] }} multiple={false} />
      ) : null}

      {/* Options panel — shown when any file is available */}
      {effectiveFile && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 space-y-5">
          {/* Show local file info bar (only if using local file, not workspace) */}
          {!workspaceFile && localFile && (
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded border border-gray-200">
              <div>
                <p className="font-medium text-sm text-gray-700 truncate max-w-sm">{localFile.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">{formatBytes(localFile.size)}</p>
              </div>
              <button onClick={handleClear} className="text-red-500 hover:text-red-700 text-xs font-medium px-2 py-1 bg-white border border-gray-200 rounded">Cambiar</button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">Idioma del documento</label>
              <div className="flex flex-col gap-1">
                {LANGUAGES.map(lang => (
                  <button key={lang.code} onClick={() => setLanguage(lang.code)} className={`flex items-center px-3 py-2 rounded text-xs text-left transition-all ${language === lang.code ? 'bg-blue-50 border-blue-500 text-blue-700 font-semibold border' : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300 border'}`}>
                    {lang.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">Opciones</label>
              <div className="flex flex-col gap-2">
                <label className="flex items-start gap-2 p-2 bg-gray-50 rounded border border-gray-200 cursor-pointer">
                  <input type="checkbox" checked={deskew} onChange={(e) => setDeskew(e.target.checked)} className="mt-1" />
                  <div>
                    <span className="text-sm font-medium text-gray-700 block">Corregir inclinación</span>
                    <span className="text-[10px] text-gray-500">Endereza páginas escaneadas.</span>
                  </div>
                </label>
                <label className="flex items-start gap-2 p-2 bg-gray-50 rounded border border-gray-200 cursor-pointer">
                  <input type="checkbox" checked={forceOcr} onChange={(e) => setForceOcr(e.target.checked)} className="mt-1" />
                  <div>
                    <span className="text-sm font-medium text-gray-700 block">Forzar re-OCR</span>
                    <span className="text-[10px] text-gray-500">Aplica OCR incluso si ya tiene texto.</span>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {alreadyHasText && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg space-y-2">
              <p className="text-sm font-semibold text-yellow-800">⚠️ Este PDF ya tiene texto</p>
              <Button onClick={() => handleProcess(true)} disabled={isProcessing} variant="outline" size="sm">
                {isProcessing ? 'Procesando...' : 'Forzar OCR'}
              </Button>
            </div>
          )}

          {/* Result actions */}
          {result && resultBlob && (
            <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-green-800">¡OCR Aplicado!</p>
                <p className="text-xs text-green-700 mt-0.5">El PDF resultante tiene texto seleccionable.</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={downloadResult}>Descargar</Button>
                {workspaceFile && (
                  <Button size="sm" onClick={async () => {
                    await ctx.replaceWithBlob(resultBlob, effectiveFile.name.replace(/\.pdf$/i, '_OCR.pdf'));
                    setResultBlob(null);
                    setResult(null);
                  }}>Reemplazar en Workspace</Button>
                )}
              </div>
            </div>
          )}

          {error && !alreadyHasText && <div className="p-3 text-sm text-red-700 bg-red-50 rounded border border-red-200">{error}</div>}

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            {!workspaceFile && (
              <Button variant="outline" onClick={handleClear} disabled={isProcessing}>Cancelar</Button>
            )}
            <Button onClick={() => handleProcess(false)} disabled={isProcessing}>
              {isProcessing ? <span className="flex items-center gap-2"><Loader className="w-4 h-4 animate-spin" /> Procesando...</span> : 'Aplicar OCR'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default OcrTool;
