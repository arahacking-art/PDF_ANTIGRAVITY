import React, { useState } from 'react';
import { usePdfContext } from '../../context/PdfContext';
import { ChevronLeft, ChevronRight, RotateCw, Trash2 } from 'lucide-react';
import { PDFDocument, degrees } from 'pdf-lib';

interface ThumbnailSidebarProps {
  visible: boolean;
  onToggle: () => void;
  currentPage: number;
}

/**
 * Collapsible thumbnail sidebar on the left side of the workspace.
 * Shows small page previews for quick navigation and quick actions.
 */
const ThumbnailSidebar: React.FC<ThumbnailSidebarProps> = ({ visible, onToggle, currentPage }) => {
  const { pageInfos, numPages, arrayBuffer, fileName, replaceWithBlob } = usePdfContext();
  const [isProcessing, setIsProcessing] = useState(false);

  const scrollToPage = (pageIndex: number) => {
    const fn = (window as any).__pdfViewerScrollToPage;
    if (fn) fn(pageIndex);
  };

  const handleRotate = async (e: React.MouseEvent, pageIndex: number) => {
    e.stopPropagation();
    if (!arrayBuffer) return;
    try {
      setIsProcessing(true);
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const page = pdfDoc.getPage(pageIndex);
      page.setRotation(degrees(page.getRotation().angle + 90));
      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
      await replaceWithBlob(blob, fileName);
    } catch (error) {
      console.error('Failed to rotate page:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, pageIndex: number) => {
    e.stopPropagation();
    if (!arrayBuffer || numPages <= 1) return; // Prevent deleting the last page
    try {
      setIsProcessing(true);
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      pdfDoc.removePage(pageIndex);
      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
      await replaceWithBlob(blob, fileName);
    } catch (error) {
      console.error('Failed to delete page:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      {/* Toggle button (always visible) */}
      <button
        onClick={onToggle}
        className="absolute left-0 top-1/2 -translate-y-1/2 z-20 bg-[#2C2C2C] text-gray-400 hover:text-white p-1 rounded-r-md shadow-md transition-colors"
        title={visible ? 'Ocultar miniaturas' : 'Mostrar miniaturas'}
      >
        {visible ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>

      {/* Sidebar panel */}
      <aside
        className="relative flex-shrink-0 bg-[#2A2A2A] border-r border-black/30 transition-all duration-200 flex flex-col"
        style={{ width: visible ? 160 : 0, opacity: visible ? 1 : 0 }}
      >
        {isProcessing && (
          <div className="absolute inset-0 z-30 bg-[#2A2A2A]/80 backdrop-blur-[2px] flex flex-col items-center justify-center text-white">
            <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin mb-2" />
            <span className="text-[10px] font-medium tracking-wider">Procesando...</span>
          </div>
        )}
        
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#777] px-1 pt-1 select-none">
            Páginas ({numPages})
          </p>

          {pageInfos.map((page) => {
            const isActive = currentPage === page.index;
            return (
              <div
                key={page.index}
                onClick={() => scrollToPage(page.index)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') scrollToPage(page.index); }}
                role="button"
                tabIndex={0}
                className={[
                  'w-full rounded-lg overflow-hidden border-2 transition-all duration-150 group text-left cursor-pointer outline-none focus:ring-2 focus:ring-blue-500',
                  isActive
                    ? 'border-blue-500 shadow-lg shadow-blue-500/20'
                    : 'border-transparent hover:border-gray-500',
                ].join(' ')}
              >
                <div className="relative bg-white">
                  {page.thumbnailUrl ? (
                    <img
                      src={page.thumbnailUrl}
                      alt={`Página ${page.index + 1}`}
                      className="w-full block"
                      draggable={false}
                    />
                  ) : (
                    <div 
                      className="w-full bg-gray-100 flex items-center justify-center animate-pulse" 
                      style={{ aspectRatio: `${page.width} / ${page.height}` }}
                    />
                  )}
                  
                  {/* Hover actions */}
                  <div className="absolute top-1 right-1 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => handleRotate(e, page.index)}
                      className="p-1 bg-black/60 hover:bg-blue-600 text-white rounded backdrop-blur-sm transition-colors"
                      title="Rotar página"
                    >
                      <RotateCw className="w-3 h-3" />
                    </button>
                    {numPages > 1 && (
                      <button
                        onClick={(e) => handleDelete(e, page.index)}
                        className="p-1 bg-black/60 hover:bg-red-600 text-white rounded backdrop-blur-sm transition-colors"
                        title="Eliminar página"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {/* Page number overlay */}
                  <span className={[
                    'absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[9px] font-bold px-1.5 py-0.5 rounded-full',
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'bg-black/50 text-white group-hover:bg-black/70',
                  ].join(' ')}>
                    {page.index + 1}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </aside>
    </>
  );
};

export default ThumbnailSidebar;
