import React, { useRef, useEffect, useState, useCallback } from 'react';
import { usePdfContext } from '../../context/PdfContext';
import { ChevronLeft, ChevronRight, RotateCw, Trash2 } from 'lucide-react';
import { usePdfWorker } from '../../hooks/usePdfWorker';

interface ThumbnailSidebarProps {
  visible: boolean;
  onToggle: () => void;
  currentPage: number;
}

/**
 * Collapsible thumbnail sidebar with:
 * - IntersectionObserver virtualization (only renders visible thumbnails)
 * - Web Worker for rotate/delete operations (non-blocking UI)
 * - Quick actions per page: rotate 90°, delete
 */
const ThumbnailSidebar: React.FC<ThumbnailSidebarProps> = ({ visible, onToggle, currentPage }) => {
  const { pageInfos, numPages, arrayBuffer, fileName, replaceWithBlob } = usePdfContext();
  const { rotatePage, deletePage } = usePdfWorker();
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingPage, setProcessingPage] = useState<number | null>(null);

  // Virtualization: which thumbnails are visible in the sidebar scroll area
  const [visibleThumbs, setVisibleThumbs] = useState<Set<number>>(new Set());
  const thumbContainerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // ── Virtualization: observe all thumb wrappers ────────────
  useEffect(() => {
    if (!thumbContainerRef.current || !visible) return;

    observerRef.current?.disconnect();

    const observer = new IntersectionObserver(
      (entries) => {
        setVisibleThumbs(prev => {
          const next = new Set(prev);
          entries.forEach(entry => {
            const idx = parseInt(entry.target.getAttribute('data-thumb-index') || '0', 10);
            if (entry.isIntersecting) next.add(idx);
            else next.delete(idx);
          });
          return next;
        });
      },
      {
        root: thumbContainerRef.current,
        rootMargin: '200px 0px',
        threshold: 0.01,
      }
    );

    const thumbEls = thumbContainerRef.current.querySelectorAll('[data-thumb-index]');
    thumbEls.forEach(el => observer.observe(el));
    observerRef.current = observer;

    return () => observer.disconnect();
  }, [pageInfos, visible]);

  // ── Scroll to the current active page in sidebar ──────────
  useEffect(() => {
    if (!visible) return;
    const el = thumbContainerRef.current?.querySelector(`[data-thumb-index="${currentPage}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [currentPage, visible]);

  // ── Navigate viewer to page on click ─────────────────────
  const scrollViewerToPage = (pageIndex: number) => {
    const fn = (window as unknown as Record<string, unknown>).__pdfViewerScrollToPage as ((i: number) => void) | undefined;
    fn?.(pageIndex);
  };

  // ── Rotate page (uses Web Worker) ────────────────────────
  const handleRotate = useCallback(async (e: React.MouseEvent, pageIndex: number) => {
    e.stopPropagation();
    if (!arrayBuffer || isProcessing) return;
    try {
      setIsProcessing(true);
      setProcessingPage(pageIndex);
      const resultBuffer = await rotatePage(arrayBuffer, pageIndex, 90);
      const blob = new Blob([resultBuffer], { type: 'application/pdf' });
      await replaceWithBlob(blob, fileName);
    } catch (error) {
      console.error('Failed to rotate page:', error);
    } finally {
      setIsProcessing(false);
      setProcessingPage(null);
    }
  }, [arrayBuffer, isProcessing, rotatePage, replaceWithBlob, fileName]);

  // ── Delete page (uses Web Worker) ────────────────────────
  const handleDelete = useCallback(async (e: React.MouseEvent, pageIndex: number) => {
    e.stopPropagation();
    if (!arrayBuffer || numPages <= 1 || isProcessing) return;
    try {
      setIsProcessing(true);
      setProcessingPage(pageIndex);
      const resultBuffer = await deletePage(arrayBuffer, pageIndex);
      const blob = new Blob([resultBuffer], { type: 'application/pdf' });
      await replaceWithBlob(blob, fileName);
    } catch (error) {
      console.error('Failed to delete page:', error);
    } finally {
      setIsProcessing(false);
      setProcessingPage(null);
    }
  }, [arrayBuffer, numPages, isProcessing, deletePage, replaceWithBlob, fileName]);

  return (
    <>
      {/* Toggle button — always visible */}
      <button
        onClick={onToggle}
        className="absolute left-0 top-1/2 -translate-y-1/2 z-20
                   bg-[#2C2C2C] text-[#999] hover:text-white
                   p-1 rounded-r-md shadow-md transition-colors"
        title={visible ? 'Ocultar miniaturas' : 'Mostrar miniaturas'}
      >
        {visible
          ? <ChevronLeft className="w-4 h-4" />
          : <ChevronRight className="w-4 h-4" />
        }
      </button>

      {/* Sidebar panel */}
      <aside
        className="relative flex-shrink-0 bg-[#232325] border-r border-black/30
                   flex flex-col overflow-hidden transition-all duration-200"
        style={{ width: visible ? 168 : 0, opacity: visible ? 1 : 0 }}
      >
        {/* Processing overlay */}
        {isProcessing && (
          <div className="absolute inset-0 z-30 bg-[#232325]/85 backdrop-blur-[2px]
                          flex flex-col items-center justify-center text-white">
            <div className="w-5 h-5 border-2 border-white/15 border-t-white rounded-full animate-spin-smooth mb-2" />
            <span className="text-[10px] font-medium tracking-wider text-[#AAA]">Procesando…</span>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-black/20">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-[#666] select-none">
            Páginas
          </span>
          <span className="text-[10px] font-medium text-[#555] select-none">
            {numPages}
          </span>
        </div>

        {/* Thumbnails scroll area */}
        <div
          ref={thumbContainerRef}
          className="flex-1 overflow-y-auto overflow-x-hidden p-2 space-y-2"
        >
          {pageInfos.map((page) => {
            const isActive = currentPage === page.index;
            const isPageProcessing = processingPage === page.index;
            const shouldRender = visibleThumbs.has(page.index);

            return (
              <div
                key={page.index}
                data-thumb-index={page.index}
                onClick={() => scrollViewerToPage(page.index)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') scrollViewerToPage(page.index); }}
                role="button"
                tabIndex={0}
                className={[
                  'w-full rounded-lg overflow-hidden border-2 transition-all duration-150',
                  'group text-left cursor-pointer outline-none',
                  'focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
                  isActive
                    ? 'border-[#4C8BF5] shadow-[0_0_0_1px_rgba(76,139,245,0.3)]'
                    : 'border-transparent hover:border-[#555]',
                ].join(' ')}
              >
                <div className="relative bg-white" style={{ aspectRatio: `${page.width} / ${page.height}` }}>

                  {/* Thumbnail image — only rendered when visible */}
                  {shouldRender && page.thumbnailUrl ? (
                    <img
                      src={page.thumbnailUrl}
                      alt={`Página ${page.index + 1}`}
                      className="w-full h-full object-cover block"
                      draggable={false}
                    />
                  ) : (
                    <div
                      className={`w-full h-full ${shouldRender && !page.thumbnailUrl ? 'skeleton' : 'bg-[#2A2A2A]'}`}
                    />
                  )}

                  {/* Per-page processing overlay */}
                  {isPageProcessing && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin-smooth" />
                    </div>
                  )}

                  {/* Hover quick actions */}
                  <div className="absolute top-1 right-1 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                    <button
                      onClick={e => handleRotate(e, page.index)}
                      disabled={isProcessing}
                      className="p-1 bg-black/65 hover:bg-blue-600 text-white rounded
                                 backdrop-blur-sm transition-colors disabled:opacity-40"
                      title="Rotar 90°"
                    >
                      <RotateCw className="w-2.5 h-2.5" />
                    </button>
                    {numPages > 1 && (
                      <button
                        onClick={e => handleDelete(e, page.index)}
                        disabled={isProcessing}
                        className="p-1 bg-black/65 hover:bg-red-600 text-white rounded
                                   backdrop-blur-sm transition-colors disabled:opacity-40"
                        title="Eliminar página"
                      >
                        <Trash2 className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </div>

                  {/* Page number badge */}
                  <span className={[
                    'absolute bottom-0.5 left-1/2 -translate-x-1/2',
                    'text-[9px] font-bold px-1.5 py-0.5 rounded-full',
                    isActive
                      ? 'bg-[#4C8BF5] text-white'
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
