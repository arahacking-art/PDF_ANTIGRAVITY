import React, { useRef, useEffect, useState, useCallback } from 'react';
import { usePdfContext } from '../../context/PdfContext';
import * as pdfjsLib from 'pdfjs-dist';

// ── Types ──────────────────────────────────────────────────
export type ZoomMode = 'fit-width' | 'fit-page' | 'custom';

interface PdfViewerProps {
  /** Current zoom level (1.0 = 100%) */
  zoom: number;
  /** Called when a page scrolls into view */
  onPageVisible?: (pageIndex: number) => void;
  /** Optional overlay renderer per page (for Redact, Sign, Watermark) */
  renderPageOverlay?: (pageIndex: number, dims: { width: number; height: number }) => React.ReactNode;
}

const PDFJS_OPTIONS = {
  cMapUrl: 'https://unpkg.com/pdfjs-dist@5.6.205/cmaps/',
  cMapPacked: true,
  standardFontDataUrl: 'https://unpkg.com/pdfjs-dist@5.6.205/standard_fonts/',
};

/**
 * Central PDF Viewer with continuous scroll.
 * Renders each page as a canvas with lazy-loading and scroll observation.
 */
const PdfViewer: React.FC<PdfViewerProps> = ({ zoom, onPageVisible, renderPageOverlay }) => {
  const { pdfDoc, numPages, pageInfos } = usePdfContext();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const renderingRef = useRef<Set<number>>(new Set());
  const renderedScaleRef = useRef<Map<number, number>>(new Map());
  const [visiblePage, setVisiblePage] = useState(0);

  // ── Render a single page to its canvas ──────────────────
  const renderPage = useCallback(async (pageIndex: number) => {
    if (!pdfDoc || renderingRef.current.has(pageIndex)) return;
    
    // Skip if already rendered at this zoom level
    if (renderedScaleRef.current.get(pageIndex) === zoom) return;

    renderingRef.current.add(pageIndex);

    try {
      const page = await pdfDoc.getPage(pageIndex + 1);
      const viewport = page.getViewport({ scale: zoom });
      const canvas = canvasRefs.current.get(pageIndex);
      if (!canvas) { renderingRef.current.delete(pageIndex); return; }

      // Use devicePixelRatio for sharp rendering on HiDPI screens
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(viewport.width * dpr);
      canvas.height = Math.round(viewport.height * dpr);
      canvas.style.width = `${Math.round(viewport.width)}px`;
      canvas.style.height = `${Math.round(viewport.height)}px`;

      const ctx = canvas.getContext('2d', { alpha: false })!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, viewport.width, viewport.height);

      await page.render({ canvasContext: ctx, viewport }).promise;
      renderedScaleRef.current.set(pageIndex, zoom);
      page.cleanup();
    } catch (e) {
      console.warn(`Failed to render page ${pageIndex + 1}:`, e);
    } finally {
      renderingRef.current.delete(pageIndex);
    }
  }, [pdfDoc, zoom]);

  // ── Intersection Observer for lazy rendering ────────────
  useEffect(() => {
    if (!pdfDoc || numPages === 0) return;

    // Clear rendered cache when zoom changes
    renderedScaleRef.current.clear();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const idx = parseInt(entry.target.getAttribute('data-page-index') || '0', 10);
          if (entry.isIntersecting) {
            renderPage(idx);
            setVisiblePage(idx);
            onPageVisible?.(idx);
          }
        }
      },
      {
        root: scrollContainerRef.current,
        rootMargin: '200px 0px', // pre-render pages 200px before they scroll into view
        threshold: 0.01,
      }
    );

    // Observe all page containers
    const containers = scrollContainerRef.current?.querySelectorAll('[data-page-index]');
    containers?.forEach(el => observer.observe(el));

    return () => observer.disconnect();
  }, [pdfDoc, numPages, zoom, renderPage, onPageVisible]);

  // ── Scroll to a specific page ───────────────────────────
  const scrollToPage = useCallback((pageIndex: number) => {
    const el = scrollContainerRef.current?.querySelector(`[data-page-index="${pageIndex}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // Expose scrollToPage via ref (for ThumbnailSidebar)
  useEffect(() => {
    (window as any).__pdfViewerScrollToPage = scrollToPage;
    return () => { delete (window as any).__pdfViewerScrollToPage; };
  }, [scrollToPage]);

  if (!pdfDoc || numPages === 0) return null;

  return (
    <div 
      ref={scrollContainerRef}
      className="flex-1 overflow-y-auto overflow-x-auto bg-gray-400/40 dark:bg-black/40 transition-colors"
      style={{ scrollBehavior: 'smooth' }}
    >
      <div className="flex flex-col items-center py-4 gap-3">
        {pageInfos.map((pageInfo) => {
          const scaledW = Math.round(pageInfo.width * zoom);
          const scaledH = Math.round(pageInfo.height * zoom);

          return (
            <div
              key={pageInfo.index}
              data-page-index={pageInfo.index}
              className="relative shadow-lg bg-white"
              style={{ width: scaledW, height: scaledH }}
            >
              {/* The canvas where pdf.js renders */}
              <canvas
                ref={(el) => {
                  if (el) canvasRefs.current.set(pageInfo.index, el);
                  else canvasRefs.current.delete(pageInfo.index);
                }}
                className="block"
                style={{ width: scaledW, height: scaledH }}
              />

              {/* Overlay layer for on-canvas tools (redact, sign, watermark) */}
              {renderPageOverlay && (
                <div
                  className="absolute inset-0 pointer-events-auto"
                  style={{ width: scaledW, height: scaledH }}
                >
                  {renderPageOverlay(pageInfo.index, { width: scaledW, height: scaledH })}
                </div>
              )}

              {/* Page number label */}
              <div className="absolute bottom-1 left-1/2 -translate-x-1/2 bg-black/50 text-white text-[10px] px-2 py-0.5 rounded-full select-none pointer-events-none">
                {pageInfo.index + 1} / {numPages}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PdfViewer;
