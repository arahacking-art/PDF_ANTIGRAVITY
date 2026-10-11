import React, {
  useRef, useEffect, useLayoutEffect, useCallback, useState, useMemo
} from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { usePdfContext } from '../../context/PdfContext';
import type { ViewRect } from '../../utils/highlight';
import { Search, ChevronUp, ChevronDown, X, Copy, Edit3, MousePointer2, Info, Printer } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────
export type ZoomMode = 'fit-width' | 'fit-page' | 'custom';

interface PdfViewerProps {
  /** Current zoom level (1.0 = 100%) */
  zoom: number;
  /** Called when a page scrolls into view */
  onPageVisible?: (pageIndex: number) => void;
  /** Optional overlay renderer per page (for Redact, Sign, Watermark) */
  renderPageOverlay?: (pageIndex: number, dims: { width: number; height: number }) => React.ReactNode;
  /** Show ruler guides */
  showRulers?: boolean;
  /** Whether the Ctrl+F search panel should be shown */
  showSearch?: boolean;
  /** Callback to close the search panel */
  onCloseSearch?: () => void;
  /** Imprime el documento (entrada del menú contextual) */
  onPrint?: () => void;
}

// Number of pages to keep rendered above/below visible area
const RENDER_BUFFER = 2;

// ── Ruler Component ────────────────────────────────────────
const Ruler: React.FC<{
  orientation: 'horizontal' | 'vertical';
  scrollOffset: number;
  zoom: number;
  pageWidth: number;   // PDF points
  pageHeight: number;  // PDF points
}> = ({ orientation, scrollOffset, zoom, pageWidth, pageHeight }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const isH = orientation === 'horizontal';
    const totalPts = isH ? pageWidth : pageHeight;
    const pxPerPt = zoom;
    const size = Math.round(totalPts * pxPerPt);

    if (isH) {
      canvas.width = size;
      canvas.height = 20;
    } else {
      canvas.width = 20;
      canvas.height = size;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = getComputedStyle(document.documentElement)
      .getPropertyValue('--bg-panel').trim() || '#f0f0f0';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = getComputedStyle(document.documentElement)
      .getPropertyValue('--border-medium').trim() || 'rgba(0,0,0,0.15)';
    ctx.fillStyle = getComputedStyle(document.documentElement)
      .getPropertyValue('--text-muted').trim() || '#888';
    ctx.font = '8px Inter, system-ui, sans-serif';
    ctx.lineWidth = 0.5;

    // Step every 50 PDF points (approx 1.76 cm)
    const step = 50;
    for (let pt = 0; pt <= totalPts; pt += step) {
      const px = Math.round(pt * pxPerPt);
      const isMajor = pt % 100 === 0;
      const tickLen = isMajor ? 12 : 7;

      ctx.beginPath();
      if (isH) {
        ctx.moveTo(px, 20 - tickLen);
        ctx.lineTo(px, 20);
      } else {
        ctx.moveTo(20 - tickLen, px);
        ctx.lineTo(20, px);
      }
      ctx.stroke();

      if (isMajor && pt > 0) {
        ctx.save();
        if (isH) {
          ctx.fillText(String(pt), px + 2, 9);
        } else {
          ctx.translate(9, px - 2);
          ctx.rotate(-Math.PI / 2);
          ctx.fillText(String(pt), 0, 0);
        }
        ctx.restore();
      }
    }
  }, [orientation, zoom, pageWidth, pageHeight, scrollOffset]);

  if (orientation === 'horizontal') {
    return (
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          transform: `translateX(${-scrollOffset}px)`,
          imageRendering: 'crisp-edges',
        }}
      />
    );
  }

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block',
        transform: `translateY(${-scrollOffset}px)`,
        imageRendering: 'crisp-edges',
      }}
    />
  );
};

// ── Text Layer Component ───────────────────────────────────
const TextLayer: React.FC<{
  pdfPage: pdfjsLib.PDFPageProxy;
  viewport: pdfjsLib.PageViewport;
  /** Texto buscado (Ctrl+F) que se marca en la página */
  searchTerm?: string;
  /** Cambia cada vez que se navega a esta página desde la búsqueda: centra la primera coincidencia */
  focusToken?: number;
}> = ({ pdfPage, viewport, searchTerm = '', focusToken }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  // Se incrementa al terminar de dibujar la capa, para volver a marcar la búsqueda
  const [renderCount, setRenderCount] = useState(0);
  const handledFocusRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = '';

    let textLayerInstance: { cancel: () => void } | null = null;
    let cancelled = false;

    pdfPage.getTextContent().then(textContent => {
      if (cancelled || !container) return;

      // pdfjs-dist v5+ uses TextLayer class
      const TextLayerClass = (pdfjsLib as unknown as {
        TextLayer: new (opts: {
      textContentSource: Awaited<ReturnType<typeof pdfPage.getTextContent>>;
          container: HTMLElement;
          viewport: pdfjsLib.PageViewport;
        }) => { render: () => Promise<void>; cancel: () => void };
      }).TextLayer;

      if (TextLayerClass) {
        // v5+ API
        const layer = new TextLayerClass({ textContentSource: textContent, container, viewport });
        textLayerInstance = layer;
        layer.render().then(() => { if (!cancelled) setRenderCount(c => c + 1); }).catch(() => {});
      } else {
        // Fallback: manual span placement
        textContent.items.forEach(item => {
          if (!('str' in item) || !item.str.trim()) return;
          const span = document.createElement('span');
          span.textContent = item.str;
          // Basic positioning (approximate)
          const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
          span.style.cssText = `
            left: ${tx[4]}px;
            top: ${tx[5]}px;
            font-size: ${Math.abs(tx[0])}px;
            font-family: sans-serif;
          `;
          container.appendChild(span);
        });
      }
    }).catch(() => {
      // Text content not available (scanned image PDF — that's OK)
    });

    return () => {
      cancelled = true;
      textLayerInstance?.cancel();
      if (container) container.innerHTML = '';
    };
  }, [pdfPage, viewport]);

  // ── Marcar coincidencias de búsqueda ─────────────────────
  // Envuelve cada coincidencia en <mark> dentro del span de pdf.js: no cambia el ancho
  // del texto, así que la posición y la selección siguen siendo correctas.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.querySelectorAll('mark.search-hit').forEach(mark => {
      const parent = mark.parentNode;
      mark.replaceWith(document.createTextNode(mark.textContent || ''));
      parent?.normalize();
    });

    const term = searchTerm.trim().toLowerCase();
    if (!term) return;

    container.querySelectorAll('span').forEach(span => {
      if (span.childNodes.length !== 1 || span.firstChild?.nodeType !== Node.TEXT_NODE) return;
      const text = span.textContent || '';
      const lower = text.toLowerCase();
      if (!lower.includes(term)) return;

      const fragment = document.createDocumentFragment();
      let pos = 0;
      for (let idx = lower.indexOf(term); idx !== -1; idx = lower.indexOf(term, pos)) {
        if (idx > pos) fragment.append(text.slice(pos, idx));
        const mark = document.createElement('mark');
        mark.className = 'search-hit';
        mark.textContent = text.slice(idx, idx + term.length);
        fragment.append(mark);
        pos = idx + term.length;
      }
      if (pos < text.length) fragment.append(text.slice(pos));
      span.replaceChildren(fragment);
    });

    if (focusToken !== undefined && handledFocusRef.current !== focusToken) {
      const first = container.querySelector('mark.search-hit');
      if (first) {
        handledFocusRef.current = focusToken;
        first.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }
  }, [searchTerm, renderCount, focusToken]);

  return (
    <div
      ref={containerRef}
      className="pdf-text-layer"
      style={{
        width: `${viewport.width}px`,
        height: `${viewport.height}px`,
        // Variables que usa pdf.js para dimensionar la capa y cada línea de texto
        '--total-scale-factor': viewport.scale,
        '--scale-round-x': '1px',
        '--scale-round-y': '1px',
      } as React.CSSProperties}
    />
  );
};

// ── Search Panel Component ─────────────────────────────────

/**
 * Texto de cada página (en minúsculas) por documento: extraerlo es lo lento de buscar,
 * y antes se repetía para todas las páginas con cada búsqueda. WeakMap: se libera solo
 * cuando el documento deja de usarse.
 */
const pageTextCache = new WeakMap<pdfjsLib.PDFDocumentProxy, Map<number, string>>();

async function getPageText(pdfDoc: pdfjsLib.PDFDocumentProxy, pageIndex: number): Promise<string> {
  let docCache = pageTextCache.get(pdfDoc);
  if (!docCache) { docCache = new Map(); pageTextCache.set(pdfDoc, docCache); }
  const cached = docCache.get(pageIndex);
  if (cached !== undefined) return cached;
  const page = await pdfDoc.getPage(pageIndex + 1);
  const textContent = await page.getTextContent();
  const text = textContent.items
    .filter((item): item is (typeof textContent.items[number] & { str: string }) => 'str' in item)
    .map(item => item.str)
    .join('')
    .toLowerCase();
  docCache.set(pageIndex, text);
  return text;
}
interface SearchPanelProps {
  pdfDoc: pdfjsLib.PDFDocumentProxy | null;
  onClose: () => void;
  onMatchFound: (pageIndex: number, rects: DOMRect[]) => void;
  /** Informa el texto buscado para marcarlo en las páginas */
  onQueryChange: (query: string) => void;
}

const SearchPanel: React.FC<SearchPanelProps> = ({ pdfDoc, onClose, onMatchFound, onQueryChange }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<{ pageIndex: number; rects: DOMRect[] }>>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!query.trim() || !pdfDoc) {
      setResults([]);
      onQueryChange('');
      return;
    }

    let cancelled = false;
    setIsSearching(true);

    const searchAll = async () => {
      const allMatches: Array<{ pageIndex: number; rects: DOMRect[] }> = [];
      const term = query.toLowerCase();

      for (let i = 0; i < pdfDoc.numPages; i++) {
        if (cancelled) break;
        try {
          if ((await getPageText(pdfDoc, i)).includes(term)) {
            // Simple match — add page to results
            allMatches.push({ pageIndex: i, rects: [] });
          }
        } catch {
          // Skip pages that fail
        }
      }

      if (!cancelled) {
        onQueryChange(allMatches.length > 0 ? query : '');
        setResults(allMatches);
        setCurrentIdx(0);
        setIsSearching(false);

        if (allMatches.length > 0) {
          onMatchFound(allMatches[0].pageIndex, allMatches[0].rects);
        }
      }
    };

    const debounce = setTimeout(searchAll, 400);
    return () => {
      cancelled = true;
      clearTimeout(debounce);
      setIsSearching(false);
    };
  }, [query, pdfDoc, onMatchFound, onQueryChange]);

  const goToMatch = useCallback((idx: number) => {
    if (results.length === 0) return;
    const wrapped = ((idx % results.length) + results.length) % results.length;
    setCurrentIdx(wrapped);
    onMatchFound(results[wrapped].pageIndex, results[wrapped].rects);
  }, [results, onMatchFound]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.shiftKey ? goToMatch(currentIdx - 1) : goToMatch(currentIdx + 1);
    }
    if (e.key === 'Escape') onClose();
  };

  const countLabel = isSearching
    ? 'Buscando…'
    : query && results.length === 0
      ? 'Sin resultados'
      : results.length > 0
        ? `${currentIdx + 1} de ${results.length}`
        : '';

  return (
    <div className="search-panel">
      <Search className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
      <input
        ref={inputRef}
        type="text"
        placeholder="Buscar en el documento…"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <span className="count">{countLabel}</span>
      <button onClick={() => goToMatch(currentIdx - 1)} disabled={results.length === 0} title="Anterior (Shift+Enter)">
        <ChevronUp className="w-3.5 h-3.5" />
      </button>
      <button onClick={() => goToMatch(currentIdx + 1)} disabled={results.length === 0} title="Siguiente (Enter)">
        <ChevronDown className="w-3.5 h-3.5" />
      </button>
      <div className="divider" />
      <button onClick={onClose} title="Cerrar (Escape)">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};


// ── Main PdfViewer ─────────────────────────────────────────
/**
 * Central PDF Viewer with:
 * - Aggressive canvas virtualization (only renders pages in viewport ± RENDER_BUFFER)
 * - Selectable text layer (pdf.js renderTextLayer)
 * - Ctrl+F search panel
 * - Optional rulers
 * - Overlay support for tools (Sign, Redact, Watermark, Annotate)
 */
const PdfViewer: React.FC<PdfViewerProps> = ({
  zoom,
  onPageVisible,
  renderPageOverlay,
  showRulers = false,
  showSearch = false,
  onCloseSearch,
  onPrint,
}) => {
  const { pdfDoc, numPages, pageInfos, arrayBuffer, replaceWithBytes, documentId } = usePdfContext();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Active pages: Set of page indices that should have a live canvas
  const [activePages, setActivePages] = useState<Set<number>>(new Set());

  // Track the current pdfDoc to detect document changes.
  // Updated synchronously during render (not in useEffect) so guards
  // fire correctly even before effects run.
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);

  // Detect document change synchronously during render
  const docChanged = pdfDocRef.current !== pdfDoc;
  if (docChanged) {
    pdfDocRef.current = pdfDoc;
  }

  // Page refs for canvas and loaded page objects
  const canvasRefs   = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const pageRefs     = useRef<Map<number, pdfjsLib.PDFPageProxy>>(new Map());
  const renderingRef = useRef<Set<number>>(new Set());
  const renderedRef  = useRef<Map<number, number>>(new Map()); // pageIdx → zoom at render

  // Scroll position for rulers
  const [scrollLeft, setScrollLeft] = useState(0);
  const [scrollTop, setScrollTop]   = useState(0);

  // Search match navigation
  const [searchMatchPage, setSearchMatchPage] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchFocusToken, setSearchFocusToken] = useState(0);

  // Posición de scroll, para conservarla cuando el documento se recarga tras aplicar
  // un cambio (mismo documentId). Al abrir otro archivo se empieza desde arriba.
  const lastScrollRef = useRef<{ documentId: number; top: number; left: number } | null>(null);

  // Context Menu & Selection Toolbar
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [selectionBox, setSelectionBox] = useState<{ x: number; y: number; text: string; range: Range } | null>(null);
  
  const [isSavingHighlight, setIsSavingHighlight] = useState(false);

  // ── Context Menu Handlers ────────────────────────────────
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  // ── Selection Toolbar Handlers ───────────────────────────
  useEffect(() => {
    const handleSelection = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        setSelectionBox(null);
        return;
      }

      const range = selection.getRangeAt(0);
      const text = selection.toString();
      
      // Ensure selection is inside the viewer
      const isInsideViewer = scrollContainerRef.current?.contains(range.commonAncestorContainer);
      if (isInsideViewer && text.trim().length > 0) {
        const rects = range.getClientRects();
        if (rects.length > 0) {
          const firstRect = rects[0];
          setSelectionBox({
            x: firstRect.left + (firstRect.width / 2),
            y: firstRect.top - 8,
            text,
            range
          });
        }
      } else {
        setSelectionBox(null);
      }
    };

    document.addEventListener('selectionchange', handleSelection);
    return () => document.removeEventListener('selectionchange', handleSelection);
  }, []);

  const handleCopy = () => {
    if (selectionBox) navigator.clipboard.writeText(selectionBox.text);
    setSelectionBox(null);
    window.getSelection()?.removeAllRanges();
  };

  /** Guarda la selección como anotación de resaltado en el PDF (se puede deshacer). */
  const handleHighlight = async () => {
    const box = selectionBox;
    setSelectionBox(null);
    window.getSelection()?.removeAllRanges();
    if (!box || !arrayBuffer || isSavingHighlight) return;

    const rectsByPage = new Map<number, ViewRect[]>();
    Array.from(box.range.getClientRects()).forEach(rect => {
      // Ignore very thin rects (sometimes artifacts of selection)
      if (rect.width < 2 || rect.height < 2) return;

      // Find the page wrapper this rect belongs to
      const elements = document.elementsFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      const pageWrapper = elements.find(el => el.hasAttribute('data-page-index'));
      if (!pageWrapper) return;

      const pageIndex = parseInt(pageWrapper.getAttribute('data-page-index') || '0', 10);
      const wrapperRect = pageWrapper.getBoundingClientRect();
      const rects = rectsByPage.get(pageIndex) || [];
      rects.push({
        x: (rect.left - wrapperRect.left) / wrapperRect.width,
        y: (rect.top - wrapperRect.top) / wrapperRect.height,
        width: rect.width / wrapperRect.width,
        height: rect.height / wrapperRect.height,
      });
      rectsByPage.set(pageIndex, rects);
    });
    if (rectsByPage.size === 0) return;

    setIsSavingHighlight(true);
    try {
      // pdf-lib se carga solo al resaltar, para no pesar en el arranque
      const { addHighlights } = await import('../../utils/highlight');
      await replaceWithBytes(await addHighlights(arrayBuffer, rectsByPage));
    } catch (e) {
      console.error('No se pudo guardar el resaltado:', e);
      alert('No se pudo guardar el resaltado en este PDF.');
    } finally {
      setIsSavingHighlight(false);
    }
  };

  // ── Clear all caches when pdfDoc changes ─────────────────
  // Se limpia siempre que cambia pdfDoc (el efecto solo corre en ese caso). No se usa
  // `docChanged`: en StrictMode el render se ejecuta dos veces y la segunda pasada ya
  // lo ve en false, así que quedaban en caché páginas del documento destruido (el visor
  // se queda montado al recargar tras aplicar un cambio).
  useEffect(() => {
    pageRefs.current.clear();
    renderingRef.current.clear();
    renderedRef.current.clear();
    canvasRefs.current.clear();
    setActivePages(new Set());
    setSearchMatchPage(null);
  }, [pdfDoc]);

  // ── Get or load a PDFPageProxy ───────────────────────────
  const getPage = useCallback(async (pageIndex: number): Promise<pdfjsLib.PDFPageProxy | null> => {
    if (!pdfDoc) return null;
    // Guard: don't use a cached page from a different/destroyed document
    if (pdfDocRef.current !== pdfDoc) return null;
    if (pageRefs.current.has(pageIndex)) return pageRefs.current.get(pageIndex)!;
    try {
      const page = await pdfDoc.getPage(pageIndex + 1);
      // Check again after the async call — pdfDoc might have changed
      if (pdfDocRef.current !== pdfDoc) return null;
      pageRefs.current.set(pageIndex, page);
      return page;
    } catch {
      return null;
    }
  }, [pdfDoc]);

  // ── Render a single page canvas ──────────────────────────
  const renderPage = useCallback(async (pageIndex: number) => {
    if (!pdfDoc || renderingRef.current.has(pageIndex)) return;
    // Guard against stale document
    if (pdfDocRef.current !== pdfDoc) return;

    // Skip if already rendered at this exact zoom
    if (renderedRef.current.get(pageIndex) === zoom) return;

    const canvas = canvasRefs.current.get(pageIndex);
    if (!canvas) return;

    renderingRef.current.add(pageIndex);

    try {
      const page = await getPage(pageIndex);
      if (!page) return;
      // Guard again after async getPage — pdfDoc may have changed
      if (pdfDocRef.current !== pdfDoc) return;

      const viewport = page.getViewport({ scale: zoom });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width  = Math.round(viewport.width  * dpr);
      canvas.height = Math.round(viewport.height * dpr);
      canvas.style.width  = `${Math.round(viewport.width)}px`;
      canvas.style.height = `${Math.round(viewport.height)}px`;

      const ctx = canvas.getContext('2d', { alpha: false })!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, viewport.width, viewport.height);

      await page.render({ canvasContext: ctx, canvas, viewport }).promise;

      // Final guard: only record as rendered if doc hasn't changed
      if (pdfDocRef.current === pdfDoc) {
        renderedRef.current.set(pageIndex, zoom);
      }
    } catch (e: unknown) {
      if ((e as {name?: string})?.name !== 'RenderingCancelledException') {
        console.warn(`Failed to render page ${pageIndex + 1}:`, e);
      }
    } finally {
      renderingRef.current.delete(pageIndex);
    }
  }, [pdfDoc, zoom, getPage]);

  // ── IntersectionObserver: track visible pages ────────────
  useEffect(() => {
    if (!pdfDoc || numPages === 0) return;

    // When zoom changes, invalidate all rendered caches
    renderedRef.current.clear();

    const visiblePages = new Set<number>();

    const observer = new IntersectionObserver(
      (entries) => {
        let changed = false;

        for (const entry of entries) {
          const idx = parseInt(entry.target.getAttribute('data-page-index') || '0', 10);
          const wasVisible = visiblePages.has(idx);

          if (entry.isIntersecting) {
            if (!wasVisible) { visiblePages.add(idx); changed = true; }
          } else {
            if (wasVisible) { visiblePages.delete(idx); changed = true; }
          }
        }

        if (changed) {
          // Expand to include buffer pages
          const buffered = new Set<number>();
          visiblePages.forEach(idx => {
            for (let b = Math.max(0, idx - RENDER_BUFFER); b <= Math.min(numPages - 1, idx + RENDER_BUFFER); b++) {
              buffered.add(b);
            }
          });
          setActivePages(prev => {
            // Unmounted pages MUST be removed from renderedRef so they repaint when they return
            prev.forEach(idx => {
              if (!buffered.has(idx)) {
                renderedRef.current.delete(idx);
              }
            });
            return new Set(buffered);
          });
        }
      },
      {
        root: scrollContainerRef.current,
        rootMargin: '300px 0px',
        threshold: 0.01,
      }
    );

    const containers = scrollContainerRef.current?.querySelectorAll('[data-page-index]');
    containers?.forEach(el => observer.observe(el));

    return () => observer.disconnect();
  }, [pdfDoc, numPages, zoom]);

  // ── Render active pages when they change ─────────────────
  useEffect(() => {
    activePages.forEach(idx => renderPage(idx));
  }, [activePages, renderPage]);

  // ── Re-render all active pages when zoom changes ─────────
  useEffect(() => {
    renderedRef.current.clear();
    activePages.forEach(idx => renderPage(idx));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  // ── Scroll to a specific page ────────────────────────────
  const scrollToPage = useCallback((pageIndex: number, behavior: ScrollBehavior = 'smooth') => {
    const el = scrollContainerRef.current?.querySelector(`[data-page-index="${pageIndex}"]`);
    el?.scrollIntoView({ behavior, block: 'start' });
  }, []);

  /** Página que ocupa la parte superior del visor (la que se está leyendo). */
  const getTopPageIndex = useCallback((): number => {
    const container = scrollContainerRef.current;
    if (!container) return 0;
    const top = container.getBoundingClientRect().top + 40;
    const wrappers = container.querySelectorAll<HTMLElement>('[data-page-index]');
    // Búsqueda binaria: primera página cuyo borde inferior queda por debajo de `top`
    let lo = 0, hi = wrappers.length - 1, found = hi;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (wrappers[mid].getBoundingClientRect().bottom > top) { found = mid; hi = mid - 1; }
      else lo = mid + 1;
    }
    return Math.max(0, found);
  }, []);

  // ── Pasar de página con el teclado: AvPág / RePág / Inicio / Fin ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
      const last = numPages - 1;
      let target: number | null = null;
      if (e.key === 'PageDown') target = Math.min(last, getTopPageIndex() + 1);
      else if (e.key === 'PageUp') target = Math.max(0, getTopPageIndex() - 1);
      else if (e.key === 'Home') target = 0;
      else if (e.key === 'End') target = last;
      if (target === null) return;
      e.preventDefault();
      // Instantáneo: con desplazamiento suave, pulsar varias veces seguidas no avanzaría
      scrollToPage(target, 'instant');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [numPages, getTopPageIndex, scrollToPage]);

  // Expose to window for ThumbnailSidebar
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__pdfViewerScrollToPage = scrollToPage;
    return () => { delete (window as unknown as Record<string, unknown>).__pdfViewerScrollToPage; };
  }, [scrollToPage]);

  // ── Scroll handler for rulers ────────────────────────────
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    setScrollLeft(el.scrollLeft);
    setScrollTop(el.scrollTop);
    lastScrollRef.current = { documentId, top: el.scrollTop, left: el.scrollLeft };
    onPageVisible?.(getTopPageIndex());
  }, [documentId, onPageVisible, getTopPageIndex]);

  // Tras recargar el mismo documento (aplicar, deshacer…), volver a la misma posición
  useLayoutEffect(() => {
    const el = scrollContainerRef.current;
    const last = lastScrollRef.current;
    if (!pdfDoc || !el || !last || last.documentId !== documentId) return;
    el.scrollTo({ top: last.top, left: last.left, behavior: 'instant' });
  }, [pdfDoc, documentId]);

  // ── Navigate to search match ─────────────────────────────
  const handleMatchFound = useCallback((pageIndex: number) => {
    setSearchMatchPage(pageIndex);
    setSearchFocusToken(t => t + 1);
    scrollToPage(pageIndex);
  }, [scrollToPage]);

  const handleCloseSearch = useCallback(() => {
    setSearchTerm('');
    onCloseSearch?.();
  }, [onCloseSearch]);

  // ── First page dimensions (for ruler scale) ──────────────
  const firstPage = pageInfos[0];

  // ── Text layer pages (only active ones) ─────────────────
  const textLayerPages = useMemo(() => {
    const map = new Map<number, { page: pdfjsLib.PDFPageProxy; viewport: pdfjsLib.PageViewport }>();
    activePages.forEach(idx => {
      const page = pageRefs.current.get(idx);
      if (page && pdfDoc) {
        const viewport = page.getViewport({ scale: zoom });
        map.set(idx, { page, viewport });
      }
    });
    return map;
  }, [activePages, zoom, pdfDoc]);

  if (!pdfDoc || numPages === 0) return null;

  const rulerOffset = showRulers ? 20 : 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">

      {/* ── Search Panel ────────────────────────────────── */}
      {showSearch && (
        <SearchPanel
          pdfDoc={pdfDoc}
          onClose={handleCloseSearch}
          onMatchFound={handleMatchFound}
          onQueryChange={setSearchTerm}
        />
      )}

      {/* ── Rulers wrapper ──────────────────────────────── */}
      {showRulers && firstPage && (
        <>
          {/* Corner square */}
          <div className="ruler-corner" style={{ position: 'absolute', zIndex: 16 }} />

          {/* Horizontal ruler */}
          <div
            className="ruler-h"
            style={{ left: rulerOffset, overflow: 'hidden', position: 'absolute', zIndex: 15 }}
          >
            <Ruler
              orientation="horizontal"
              scrollOffset={scrollLeft}
              zoom={zoom}
              pageWidth={firstPage.width}
              pageHeight={firstPage.height}
            />
          </div>

          {/* Vertical ruler */}
          <div
            className="ruler-v"
            style={{ top: rulerOffset, overflow: 'hidden', position: 'absolute', zIndex: 15 }}
          >
            <Ruler
              orientation="vertical"
              scrollOffset={scrollTop}
              zoom={zoom}
              pageWidth={firstPage.width}
              pageHeight={firstPage.height}
            />
          </div>
        </>
      )}

      {/* ── Scroll area ─────────────────────────────────── */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        onContextMenu={handleContextMenu}
        className="flex-1 overflow-auto viewer-bg"
        style={{
          paddingTop:  showRulers ? `${rulerOffset + 16}px` : '16px',
          paddingLeft: showRulers ? `${rulerOffset + 8}px`  : '8px',
          scrollBehavior: 'smooth',
        }}
      >
        <div className="flex flex-col items-center gap-3 pb-20">
          {pageInfos.map((pageInfo) => {
            const scaledW = Math.round(pageInfo.width  * zoom);
            const scaledH = Math.round(pageInfo.height * zoom);
            const isActive = activePages.has(pageInfo.index);
            const textData = textLayerPages.get(pageInfo.index);

            return (
              <div
                key={pageInfo.index}
                data-page-index={pageInfo.index}
                className="relative pdf-page-wrapper bg-white flex-shrink-0"
                style={{ width: scaledW, height: scaledH }}
              >
                {/* Canvas — only mounted when page is active */}
                {isActive ? (
                  <canvas
                    ref={el => {
                      if (el) canvasRefs.current.set(pageInfo.index, el);
                      else canvasRefs.current.delete(pageInfo.index);
                    }}
                    className="block absolute inset-0"
                    style={{ width: scaledW, height: scaledH }}
                  />
                ) : (
                  /* Placeholder keeps the layout stable when canvas is unmounted */
                  <div
                    className="absolute inset-0 skeleton"
                    style={{ width: scaledW, height: scaledH }}
                  />
                )}

                {/* Text layer — selectable text */}
                {isActive && textData && (
                  <TextLayer
                    pdfPage={textData.page}
                    viewport={textData.viewport}
                    searchTerm={showSearch ? searchTerm : ''}
                    focusToken={searchMatchPage === pageInfo.index ? searchFocusToken : undefined}
                  />
                )}

                {/* Tool overlay layer (Sign, Redact, Watermark, etc.) */}
                {renderPageOverlay && (
                  <div
                    className="absolute inset-0 pointer-events-auto"
                    style={{ width: scaledW, height: scaledH }}
                  >
                    {renderPageOverlay(pageInfo.index, { width: scaledW, height: scaledH })}
                  </div>
                )}

                {/* Search match highlight */}
                {searchMatchPage === pageInfo.index && (
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      boxShadow: 'inset 0 0 0 3px rgba(255,180,0,0.7)',
                      borderRadius: 1,
                    }}
                  />
                )}

                {/* Page number badge */}
                <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 bg-black/40 backdrop-blur-sm text-white text-[10px] font-medium px-2 py-0.5 rounded-full select-none pointer-events-none">
                  {pageInfo.index + 1} / {numPages}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Selection Mini-Toolbar ──────────────────────── */}
      {selectionBox && (
        <div
          className="mini-toolbar fixed"
          style={{
            left: selectionBox.x,
            top: selectionBox.y,
            transform: 'translate(-50%, -100%)',
          }}
          onMouseDown={(e) => e.preventDefault()} // Prevent losing selection when clicking buttons
        >
          <button onClick={handleHighlight} title="Resaltar texto (se guarda en el PDF)">
            <Edit3 className="w-3.5 h-3.5 text-yellow-500" />
            Resaltar
          </button>
          <div className="separator" />
          <button onClick={handleCopy} title="Copiar al portapapeles">
            <Copy className="w-3.5 h-3.5 text-blue-400" />
            Copiar
          </button>
        </div>
      )}

      {/* ── Context Menu ────────────────────────────────── */}
      {contextMenu && (
        <div
          className="context-menu fixed z-[9999]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button onClick={() => {
            const sel = window.getSelection();
            if (sel && !sel.isCollapsed) {
              navigator.clipboard.writeText(sel.toString());
              sel.removeAllRanges();
            }
            setContextMenu(null);
          }}>
            <Copy className="w-4 h-4 text-[var(--text-secondary)]" /> Copiar
          </button>
          <div className="mx-2 my-1 h-px bg-[var(--border-medium)]" />
          <button onClick={() => {
            const range = document.createRange();
            if (scrollContainerRef.current) {
              range.selectNodeContents(scrollContainerRef.current);
              const sel = window.getSelection();
              sel?.removeAllRanges();
              sel?.addRange(range);
            }
            setContextMenu(null);
          }}>
            <MousePointer2 className="w-4 h-4 text-[var(--text-secondary)]" /> Seleccionar todo
          </button>
          {onPrint && (
            <>
              <div className="mx-2 my-1 h-px bg-[var(--border-medium)]" />
              <button onClick={() => { setContextMenu(null); onPrint(); }}>
                <Printer className="w-4 h-4 text-[var(--text-secondary)]" /> Imprimir…
                <span className="ml-auto pl-4 text-[11px] text-[var(--text-muted)]">Ctrl+P</span>
              </button>
            </>
          )}
          <div className="mx-2 my-1 h-px bg-[var(--border-medium)]" />
          <button onClick={() => {
            alert(`Documento: ${pdfDoc.numPages} páginas.\nVisualizando en CamePDF.`);
            setContextMenu(null);
          }}>
            <Info className="w-4 h-4 text-[var(--text-secondary)]" /> Propiedades...
          </button>
        </div>
      )}
    </div>
  );
};

export default PdfViewer;
