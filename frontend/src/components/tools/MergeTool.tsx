import React, { useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import Dropzone from '../ui/Dropzone';
import Button from '../ui/Button';
import { GitMerge, Loader, GripVertical, Trash2 } from 'lucide-react';

const downloadBlob = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
};

const MergeTool: React.FC = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const handleMerge = async () => {
    if (files.length < 2) return;
    setIsProcessing(true); setError(null);
    try {
      const mergedPdf = await PDFDocument.create();
      for (const file of files) {
        const ab = await file.arrayBuffer();
        const pdf = await PDFDocument.load(ab);
        const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
      }
      const bytes = await mergedPdf.save();
      downloadBlob(new Blob([bytes], { type: 'application/pdf' }), 'Documento_Unido.pdf');
    } catch (e: any) {
      setError(e.message || 'Error al unir los PDFs');
    } finally {
      setIsProcessing(false);
    }
  };

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const handleDrop = (e: React.DragEvent, dropIdx: number) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === dropIdx) {
      setDraggedIdx(null); setDragOverIdx(null); return;
    }
    const newFiles = [...files];
    const [removed] = newFiles.splice(draggedIdx, 1);
    newFiles.splice(dropIdx, 0, removed);
    setFiles(newFiles);
    setDraggedIdx(null); setDragOverIdx(null);
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-5">
      <div className="flex items-center gap-3 pb-2 border-b border-gray-200">
        <div className="p-2 bg-blue-50 rounded-lg"><GitMerge className="w-5 h-5 text-blue-600" /></div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Unir PDFs</h1>
          <p className="text-sm text-gray-500">Combina múltiples archivos en uno solo. Procesado localmente.</p>
        </div>
      </div>

      <Dropzone onFilesSelected={(newFiles) => setFiles([...files, ...newFiles])} accept={{ 'application/pdf': ['.pdf'] }} multiple />

      {files.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Orden de los archivos</h3>
            <span className="text-xs text-gray-500">{files.length} archivo{files.length !== 1 ? 's' : ''}</span>
          </div>

          <div className="space-y-2">
            {files.map((file, i) => {
              const isDragging = draggedIdx === i;
              const isOver = dragOverIdx === i && draggedIdx !== i;
              return (
                <div
                  key={`${file.name}-${i}`}
                  draggable
                  onDragStart={() => setDraggedIdx(i)}
                  onDragOver={(e) => { e.preventDefault(); setDragOverIdx(i); }}
                  onDrop={(e) => handleDrop(e, i)}
                  onDragEnd={() => { setDraggedIdx(null); setDragOverIdx(null); }}
                  className={[
                    'flex items-center gap-3 p-3 bg-gray-50 rounded border transition-all cursor-grab active:cursor-grabbing',
                    isDragging ? 'opacity-30 border-blue-400' : 'border-gray-200 hover:border-gray-300',
                    isOver ? 'border-blue-500 shadow-md scale-[1.01]' : '',
                  ].join(' ')}
                >
                  <GripVertical className="w-4 h-4 text-gray-400" />
                  <span className="font-mono bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs">{i + 1}</span>
                  <span className="text-sm font-medium text-gray-700 flex-1 truncate">{file.name}</span>
                  <span className="text-xs text-gray-400">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                  <button onClick={() => removeFile(i)} className="p-1 text-red-400 hover:text-red-600 rounded hover:bg-red-50">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>

          {error && <div className="p-3 text-sm text-red-700 bg-red-50 rounded-lg border border-red-200">{error}</div>}

          <div className="flex justify-between items-center pt-2 border-t border-gray-100">
            <button onClick={() => setFiles([])} disabled={isProcessing} className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50">Limpiar todo</button>
            <Button onClick={handleMerge} disabled={files.length < 2 || isProcessing} size="lg">
              {isProcessing ? <span className="flex items-center gap-2"><Loader className="w-4 h-4 animate-spin" />Uniendo...</span> : 'Unir archivos'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MergeTool;
