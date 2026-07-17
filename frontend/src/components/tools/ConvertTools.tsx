import React, { useState } from 'react';
import { useBackendConvert } from '../../hooks/useBackendConvert';
import { usePdfContext } from '../../context/PdfContext';
import Dropzone from '../ui/Dropzone';
import Button from '../ui/Button';
import { FileText, Monitor, Table2, Loader, CheckCircle } from 'lucide-react';

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
};

interface ConvertToolProps {
  title: string;
  description: string;
  Icon: React.FC<any>;
  endpoint: '/api/to-word' | '/api/to-pptx' | '/api/to-excel';
  outputExt: string;
  outputMime: string;
  note?: string;
}

const ConvertTool: React.FC<ConvertToolProps> = ({ title, description, Icon, endpoint, outputExt, note }) => {
  const ctx = usePdfContext();
  const workspaceFile = ctx.file;

  const [localFile, setLocalFile] = useState<File | null>(null);
  const effectiveFile = workspaceFile || localFile;

  const { convert, isProcessing, error } = useBackendConvert({ endpoint });
  const [done, setDone] = useState(false);

  const handleConvert = async () => {
    if (!effectiveFile) return;
    setDone(false);
    const blob = await convert(effectiveFile);
    if (blob) {
      const outName = effectiveFile.name.replace(/\.pdf$/i, `.${outputExt}`);
      downloadBlob(blob, outName);
      setDone(true);
    }
  };

  const hasFile = !!effectiveFile;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-5">
      <div className="flex items-center gap-3 pb-2 border-b border-gray-200">
        <div className="p-2 bg-blue-50 rounded-lg"><Icon className="w-5 h-5 text-blue-600" /></div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{title}</h1>
          <p className="text-sm text-gray-500">{description}</p>
        </div>
      </div>

      {!hasFile ? (
        <Dropzone onFilesSelected={(f) => { if (f[0]) { setLocalFile(f[0]); setDone(false); } }} accept={{ 'application/pdf': ['.pdf'] }} multiple={false} />
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 space-y-5">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded border border-gray-200">
            <div>
              <p className="font-medium text-sm text-gray-700 truncate max-w-sm">{effectiveFile.name}</p>
              <p className="text-xs text-gray-500 mt-0.5">{(effectiveFile.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
            {workspaceFile ? (
              <span className="text-xs text-blue-600 font-medium px-2 py-1 bg-blue-50 border border-blue-200 rounded">Workspace</span>
            ) : (
              <button onClick={() => { setLocalFile(null); setDone(false); }} className="text-red-500 hover:text-red-700 text-xs font-medium px-2 py-1 bg-white border border-gray-200 rounded">Cambiar archivo</button>
            )}
          </div>

          {note && (
            <div className="flex items-start gap-2 p-3 bg-yellow-50 rounded-lg">
              <span className="text-yellow-600 text-sm mt-0.5">⚠️</span>
              <p className="text-xs text-yellow-800 leading-relaxed">{note}</p>
            </div>
          )}

          <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg">
            <span className="text-blue-500 text-sm mt-0.5">🔄</span>
            <p className="text-xs text-blue-700 leading-relaxed">
              La conversión requiere procesamiento intensivo. Se realizará en el servidor interno de forma segura.
            </p>
          </div>

          {done && !isProcessing && (
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <p className="text-sm font-medium text-green-800">¡Archivo convertido y descargado correctamente!</p>
            </div>
          )}

          {error && <div className="p-3 text-sm text-red-700 bg-red-50 rounded border border-red-200">{error}</div>}

          <div className="flex justify-between items-center pt-2 border-t border-gray-100">
            {!workspaceFile ? (
              <button onClick={() => { setLocalFile(null); setDone(false); }} disabled={isProcessing} className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50">Cancelar</button>
            ) : (
              <div />
            )}
            <Button onClick={handleConvert} disabled={isProcessing} size="lg">
              {isProcessing ? <span className="flex items-center gap-2"><Loader className="w-4 h-4 animate-spin" /> Convirtiendo...</span> : `Convertir y Descargar`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export const PdfToWordTool: React.FC = () => (
  <ConvertTool
    title="PDF a Word"
    description="Convierte tu PDF a un documento Word editable (.docx) manteniendo el formato."
    Icon={FileText}
    endpoint="/api/to-word"
    outputExt="docx"
    outputMime="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    note="La precisión de la conversión depende de la complejidad del PDF. Los PDFs con texto seleccionable dan mejores resultados."
  />
);

export const PdfToPptxTool: React.FC = () => (
  <ConvertTool
    title="PDF a PowerPoint"
    description="Convierte cada página del PDF en una diapositiva de PowerPoint (.pptx)."
    Icon={Monitor}
    endpoint="/api/to-pptx"
    outputExt="pptx"
    outputMime="application/vnd.openxmlformats-officedocument.presentationml.presentation"
    note="Cada página del PDF se convierte en una imagen dentro de una diapositiva. El texto no será editable en PowerPoint."
  />
);

export const PdfToExcelTool: React.FC = () => (
  <ConvertTool
    title="PDF a Excel"
    description="Extrae tablas y datos de tu PDF y los exporta a un archivo Excel (.xlsx)."
    Icon={Table2}
    endpoint="/api/to-excel"
    outputExt="xlsx"
    outputMime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    note="El extractor detecta automáticamente tablas. Si no hay tablas, se exportará el texto plano en formato de lista."
  />
);

export default ConvertTool;
