import React, { useState } from 'react';
import { usePdfCreate, type PdfBlock, type TextBlock, type ImageBlock } from '../../hooks/usePdfCreate';
import Button from '../ui/Button';
import { FilePlus, Type, Image, ChevronUp, ChevronDown, Trash2 } from 'lucide-react';

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
};

let nextId = 1;
const genId = () => `block-${nextId++}`;

const CreatePdfTool: React.FC = () => {
  const [blocks, setBlocks] = useState<PdfBlock[]>([]);
  const [docTitle, setDocTitle] = useState('Mi Documento');
  const { createPdf, isProcessing, error } = usePdfCreate();

  const addTextBlock = () => {
    const block: TextBlock = { id: genId(), type: 'text', title: `Página ${blocks.length + 1}`, content: '', fontSize: 12 };
    setBlocks([...blocks, block]);
  };

  const addImageBlock = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onloadend = () => {
        const block: ImageBlock = {
          id: genId(), type: 'image',
          title: `Página ${blocks.length + 1}`,
          file, dataUrl: reader.result as string,
        };
        setBlocks(prev => [...prev, block]);
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const updateBlock = (id: string, changes: Partial<PdfBlock>) => {
    setBlocks(blocks.map(b => b.id === id ? { ...b, ...changes } as PdfBlock : b));
  };

  const removeBlock = (id: string) => setBlocks(blocks.filter(b => b.id !== id));

  const moveBlock = (index: number, direction: -1 | 1) => {
    const newBlocks = [...blocks];
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= newBlocks.length) return;
    [newBlocks[index], newBlocks[swapIndex]] = [newBlocks[swapIndex], newBlocks[index]];
    setBlocks(newBlocks);
  };

  const handleCreate = async () => {
    const blob = await createPdf(blocks);
    if (blob) downloadBlob(blob, `${docTitle.trim() || 'documento'}.pdf`);
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-5">
            <div className="flex items-center gap-3 pb-2 border-b border-gray-200">
        <div className="p-2 bg-blue-50 rounded-lg"><FilePlus className="w-5 h-5 text-blue-600" /></div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Crear PDF desde Cero</h1>
          <p className="text-sm text-gray-500">Añade bloques de texto o imágenes, ordénalos y genera tu PDF al instante.</p>
        </div>
      </div>

      {/* Nombre del documento */}
      <div className="space-y-1">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Nombre del documento</label>
        <input type="text" value={docTitle} onChange={(e) => setDocTitle(e.target.value)}
          placeholder="Mi documento..."
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 transition-colors" />
      </div>

      {/* Bloques */}
      {blocks.length === 0 ? (
        <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-12 text-center space-y-3">
          <p className="text-gray-400 dark:text-gray-500">No hay páginas aún. Añade un bloque para comenzar.</p>
          <div className="flex justify-center gap-3">
            <button onClick={addTextBlock}
              className="flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg border border-blue-200 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors text-sm font-medium">
              <Type className="w-4 h-4" /> Página de texto
            </button>
            <button onClick={addImageBlock}
              className="flex items-center gap-2 px-4 py-2 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-lg border border-purple-200 dark:border-purple-700 hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors text-sm font-medium">
              <Image className="w-4 h-4" /> Página con imagen
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {blocks.map((block, index) => (
            <div key={block.id}
              className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              {/* Block header */}
              <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-slate-700 border-b border-gray-200 dark:border-gray-600">
                <span className="text-xs font-mono bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-1 rounded">
                  Pág. {index + 1}
                </span>
                <span className="text-xs text-gray-400">{block.type === 'text' ? '📝 Texto' : '🖼️ Imagen'}</span>
                <div className="flex-1" />
                <button onClick={() => moveBlock(index, -1)} disabled={index === 0}
                  className="p-1 rounded hover:bg-gray-200 dark:hover:bg-slate-600 disabled:opacity-30 transition-colors">
                  <ChevronUp className="w-4 h-4 text-gray-500" />
                </button>
                <button onClick={() => moveBlock(index, 1)} disabled={index === blocks.length - 1}
                  className="p-1 rounded hover:bg-gray-200 dark:hover:bg-slate-600 disabled:opacity-30 transition-colors">
                  <ChevronDown className="w-4 h-4 text-gray-500" />
                </button>
                <button onClick={() => removeBlock(block.id)}
                  className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors">
                  <Trash2 className="w-4 h-4 text-red-500" />
                </button>
              </div>

              {/* Block content */}
              <div className="p-4 space-y-3">
                <input type="text" value={block.title} onChange={(e) => updateBlock(block.id, { title: e.target.value })}
                  placeholder="Título de la página"
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg dark:bg-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 transition-colors" />

                {block.type === 'text' && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <label className="text-xs text-gray-500">Tamaño de fuente:</label>
                      <select value={(block as TextBlock).fontSize}
                        onChange={(e) => updateBlock(block.id, { fontSize: parseInt(e.target.value) } as Partial<TextBlock>)}
                        className="text-xs border border-gray-200 dark:border-gray-600 rounded px-2 py-1 dark:bg-slate-900 dark:text-white">
                        {[8, 10, 11, 12, 14, 16, 18, 24].map(s => <option key={s} value={s}>{s}pt</option>)}
                      </select>
                    </div>
                    <textarea value={(block as TextBlock).content}
                      onChange={(e) => updateBlock(block.id, { content: e.target.value } as Partial<TextBlock>)}
                      rows={6} placeholder="Escribe el contenido de esta página..."
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg dark:bg-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 transition-colors resize-none" />
                  </div>
                )}

                {block.type === 'image' && (
                  <div className="flex items-center gap-4">
                    <img src={(block as ImageBlock).dataUrl} alt="Vista previa"
                      className="h-24 w-auto object-contain rounded border border-gray-200 dark:border-gray-600" />
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-300">{(block as ImageBlock).file.name}</p>
                      <p className="text-xs text-gray-400">{((block as ImageBlock).file.size / 1024).toFixed(0)} KB</p>
                      <p className="text-xs text-gray-400 mt-1">La imagen se centrará en la página A4.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Botones para añadir más bloques */}
          <div className="flex gap-3 pt-2">
            <button onClick={addTextBlock}
              className="flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg border border-blue-200 dark:border-blue-700 hover:bg-blue-100 transition-colors text-sm font-medium">
              <Type className="w-4 h-4" /> + Página de texto
            </button>
            <button onClick={addImageBlock}
              className="flex items-center gap-2 px-4 py-2 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-lg border border-purple-200 dark:border-purple-700 hover:bg-purple-100 transition-colors text-sm font-medium">
              <Image className="w-4 h-4" /> + Página con imagen
            </button>
          </div>
        </div>
      )}

      {error && <div className="p-4 text-sm text-red-700 bg-red-100 rounded-lg dark:bg-red-900/30 dark:text-red-400">{error}</div>}

      <div className="flex justify-end gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
        <Button variant="outline" onClick={() => setBlocks([])} disabled={isProcessing || blocks.length === 0}>
          Limpiar todo
        </Button>
        <Button onClick={handleCreate} disabled={blocks.length === 0 || isProcessing} size="lg">
          {isProcessing ? 'Generando PDF...' : `Crear PDF (${blocks.length} página${blocks.length !== 1 ? 's' : ''})`}
        </Button>
      </div>
    </div>
  );
};

export default CreatePdfTool;
