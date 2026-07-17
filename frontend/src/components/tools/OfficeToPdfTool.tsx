import React, { useState } from 'react';
import Button from '../ui/Button';
import { FileUp, Loader, CheckCircle, XCircle, X } from 'lucide-react';

const BACKEND_URL = 'http://localhost:8000';

const ALL_EXTENSIONS = ['.docx', '.doc', '.odt', '.rtf', '.xlsx', '.xls', '.ods', '.csv', '.pptx', '.ppt', '.odp', '.txt'];

const EXT_ICONS: Record<string, { icon: string; label: string; color: string }> = {
  '.docx': { icon: '📝', label: 'Word', color: 'text-blue-600' },
  '.doc':  { icon: '📝', label: 'Word', color: 'text-blue-600' },
  '.odt':  { icon: '📝', label: 'Writer', color: 'text-blue-500' },
  '.rtf':  { icon: '📝', label: 'RTF', color: 'text-blue-400' },
  '.xlsx': { icon: '📊', label: 'Excel', color: 'text-green-600' },
  '.xls':  { icon: '📊', label: 'Excel', color: 'text-green-600' },
  '.ods':  { icon: '📊', label: 'Calc', color: 'text-green-500' },
  '.csv':  { icon: '📊', label: 'CSV', color: 'text-green-400' },
  '.pptx': { icon: '📈', label: 'PowerPoint', color: 'text-orange-600' },
  '.ppt':  { icon: '📈', label: 'PowerPoint', color: 'text-orange-600' },
  '.odp':  { icon: '📈', label: 'Impress', color: 'text-orange-500' },
  '.txt':  { icon: '📄', label: 'Texto', color: 'text-gray-500' },
};

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
};

const OfficeToPdfTool: React.FC = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<Map<string, 'pending' | 'done' | 'error'>>(new Map());
  const [errors, setErrors] = useState<Map<string, string>>(new Map());

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files).filter(f => {
      const ext = '.' + f.name.split('.').pop()?.toLowerCase();
      return ALL_EXTENSIONS.includes(ext);
    });
    setFiles(prev => [...prev, ...dropped]);
  };

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    setFiles(prev => [...prev, ...picked]);
    e.target.value = '';
  };

  const removeFile = (index: number) => setFiles(prev => prev.filter((_, i) => i !== index));
  const getExt = (name: string) => '.' + name.split('.').pop()?.toLowerCase();

  const convertFile = async (file: File): Promise<void> => {
    setResults(prev => new Map(prev).set(file.name, 'pending'));
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(`${BACKEND_URL}/api/office-to-pdf`, { method: 'POST', body: formData });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: `Error ${response.status}` }));
        throw new Error(err.detail);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name.replace(/\.[^/.]+$/, '.pdf');
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
      setResults(prev => new Map(prev).set(file.name, 'done'));
    } catch (err: any) {
      setResults(prev => new Map(prev).set(file.name, 'error'));
      setErrors(prev => new Map(prev).set(file.name, err.message || 'Error desconocido'));
    }
  };

  const handleConvertAll = async () => {
    if (files.length === 0) return;
    setIsProcessing(true); setResults(new Map()); setErrors(new Map());
    for (const file of files) await convertFile(file);
    setIsProcessing(false);
  };

  const allDone = files.length > 0 && files.every(f => results.get(f.name) === 'done');

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-5">
      <div className="flex items-center gap-3 pb-2 border-b border-gray-200">
        <div className="p-2 bg-blue-50 rounded-lg"><FileUp className="w-5 h-5 text-blue-600" /></div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Office a PDF</h1>
          <p className="text-sm text-gray-500">Convierte documentos Word, Excel y PowerPoint a PDF.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {Object.entries(EXT_ICONS).filter(([ext], i, arr) => arr.findIndex(([e]) => EXT_ICONS[e].label === EXT_ICONS[ext].label) === i).map(([ext, { icon, label, color }]) => (
          <span key={ext} className={`flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-50 border border-gray-200 ${color}`}>
            <span>{icon}</span> {label}
          </span>
        ))}
      </div>

      <div
        className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => document.getElementById('office-file-input')?.click()}
      >
        <input id="office-file-input" type="file" multiple accept={ALL_EXTENSIONS.join(',')} className="hidden" onChange={handleInput} />
        <FileUp className="w-8 h-8 text-gray-400 mx-auto mb-2" />
        <p className="text-sm text-gray-600 font-medium">Arrastra archivos aquí o <span className="text-blue-600">haz clic para seleccionarlos</span></p>
      </div>

      {files.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-3 bg-gray-50 border-b border-gray-200">
            <span className="text-sm font-semibold text-gray-700">{files.length} archivo{files.length > 1 ? 's' : ''}</span>
            {!isProcessing && <button onClick={() => { setFiles([]); setResults(new Map()); setErrors(new Map()); }} className="text-xs text-red-500 hover:text-red-700 font-medium">Limpiar todo</button>}
          </div>

          <div className="divide-y divide-gray-100">
            {files.map((file, index) => {
              const ext = getExt(file.name);
              const meta = EXT_ICONS[ext] || { icon: '📄', label: ext, color: 'text-gray-500' };
              const status = results.get(file.name);
              const errMsg = errors.get(file.name);

              return (
                <div key={`${file.name}-${index}`} className="flex items-center gap-3 px-4 py-3 bg-white">
                  <span className="text-xl">{meta.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{file.name}</p>
                    <p className="text-xs text-gray-400">{formatBytes(file.size)} · {meta.label}</p>
                    {errMsg && <p className="text-xs text-red-500 mt-0.5">{errMsg}</p>}
                  </div>
                  {status === 'pending' && <Loader className="w-4 h-4 text-blue-500 animate-spin" />}
                  {status === 'done' && <CheckCircle className="w-4 h-4 text-green-500" />}
                  {status === 'error' && <XCircle className="w-4 h-4 text-red-500" />}
                  {!status && !isProcessing && (
                    <button onClick={() => removeFile(index)} className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"><X className="w-4 h-4" /></button>
                  )}
                </div>
              );
            })}
          </div>

          {allDone && (
            <div className="p-3 bg-green-50 border-t border-green-200 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <p className="text-sm text-green-700 font-medium">¡Todos los archivos fueron convertidos exitosamente a PDF!</p>
            </div>
          )}

          <div className="p-4 border-t border-gray-100 flex justify-end">
            <Button onClick={handleConvertAll} disabled={files.length === 0 || isProcessing}>
              {isProcessing ? <span className="flex items-center gap-2"><Loader className="w-4 h-4 animate-spin" /> Convirtiendo...</span> : `Convertir ${files.length > 1 ? 'Todos' : 'a PDF'}`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default OfficeToPdfTool;
