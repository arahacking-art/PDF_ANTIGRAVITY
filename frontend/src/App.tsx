import React, { useState, useCallback, useEffect } from 'react';
import {
  GitMerge, Scissors, LayoutGrid, RotateCw, Minimize2,
  FilePlus2, PenLine, Droplets, EyeOff, ShieldCheck, ShieldOff,
  FileText, Monitor, Table2, Image, FileUp, ScanText,
  ChevronLeft, ChevronRight, X, Download, Sun, Moon,
  Type, CheckSquare, Lock,
} from 'lucide-react';

import { ThemeProvider, useTheme } from './context/ThemeContext';
import { PdfProvider, usePdfContext } from './context/PdfContext';
import { WorkspaceProvider, useWorkspace } from './context/WorkspaceContext';
import PdfViewer from './components/workspace/PdfViewer';
import ThumbnailSidebar from './components/workspace/ThumbnailSidebar';
import ZoomToolbar from './components/workspace/ZoomToolbar';
import WelcomeDropzone from './components/workspace/WelcomeDropzone';

// ── Tool imports ──────────────────────────────────────────
import MergeTool       from './components/tools/MergeTool';
import SplitTool       from './components/tools/SplitTool';
import SignTool        from './components/tools/SignTool';
import ReorganizeTool  from './components/tools/ReorganizeTool';
import ProtectTool     from './components/tools/ProtectTool';
import UnlockTool      from './components/tools/UnlockTool';
import CompressTool    from './components/tools/CompressTool';
import RotateTool      from './components/tools/RotateTool';
import WatermarkTool   from './components/tools/WatermarkTool';
import CreatePdfTool   from './components/tools/CreatePdfTool';
import RedactTool      from './components/tools/RedactTool';
import PdfToJpgTool    from './components/tools/PdfToJpgTool';
import { PdfToWordTool, PdfToPptxTool, PdfToExcelTool } from './components/tools/ConvertTools';
import OfficeToPdfTool from './components/tools/OfficeToPdfTool';
import OcrTool         from './components/tools/OcrTool';
import AnnotateTool    from './components/tools/AnnotateTool';
import FormTool        from './components/tools/FormTool';

// ── Types ─────────────────────────────────────────────────
type ToolId =
  | 'merge' | 'split' | 'reorganize' | 'rotate' | 'compress'
  | 'create' | 'sign' | 'watermark' | 'redact' | 'annotate' | 'form'
  | 'protect' | 'unlock'
  | 'to-word' | 'to-pptx' | 'to-excel' | 'to-jpg'
  | 'office-to-pdf' | 'ocr';

interface NavItem { id: ToolId; label: string; Icon: React.FC<{ className?: string; style?: React.CSSProperties }>; }
interface NavGroup { label: string; items: NavItem[]; }

// ── Navigation config ─────────────────────────────────────
const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Organizar',
    items: [
      { id: 'merge',      label: 'Unir PDFs',       Icon: GitMerge   },
      { id: 'split',      label: 'Extraer Páginas',  Icon: Scissors   },
      { id: 'reorganize', label: 'Reorganizar',       Icon: LayoutGrid },
      { id: 'rotate',     label: 'Rotar',             Icon: RotateCw   },
      { id: 'compress',   label: 'Comprimir',         Icon: Minimize2  },
    ],
  },
  {
    label: 'Editar',
    items: [
      { id: 'create',    label: 'Crear PDF',      Icon: FilePlus2   },
      { id: 'annotate',  label: 'Anotar',          Icon: Type        },
      { id: 'form',      label: 'Formularios',     Icon: CheckSquare },
      { id: 'sign',      label: 'Firma Visual',    Icon: PenLine     },
      { id: 'watermark', label: 'Marca de Agua',   Icon: Droplets    },
      { id: 'redact',    label: 'Censurar',        Icon: EyeOff      },
    ],
  },
  {
    label: 'Seguridad',
    items: [
      { id: 'protect', label: 'Proteger',     Icon: ShieldCheck },
      { id: 'unlock',  label: 'Desbloquear',  Icon: ShieldOff   },
    ],
  },
  {
    label: 'Convertir PDF',
    items: [
      { id: 'to-word',  label: 'PDF a Word',       Icon: FileText },
      { id: 'to-pptx',  label: 'PDF a PowerPoint', Icon: Monitor  },
      { id: 'to-excel', label: 'PDF a Excel',       Icon: Table2   },
      { id: 'to-jpg',   label: 'PDF a JPG',         Icon: Image    },
    ],
  },
  {
    label: 'Digitalizar',
    items: [
      { id: 'office-to-pdf', label: 'Office a PDF', Icon: FileUp   },
      { id: 'ocr',           label: 'OCR',           Icon: ScanText },
    ],
  },
];

const TOOL_COMPONENTS: Record<ToolId, React.FC> = {
  merge:           MergeTool,
  split:           SplitTool,
  reorganize:      ReorganizeTool,
  rotate:          RotateTool,
  compress:        CompressTool,
  create:          CreatePdfTool,
  sign:            SignTool,
  watermark:       WatermarkTool,
  redact:          RedactTool,
  annotate:        AnnotateTool,
  form:            FormTool,
  protect:         ProtectTool,
  unlock:          UnlockTool,
  'to-word':       PdfToWordTool,
  'to-pptx':       PdfToPptxTool,
  'to-excel':      PdfToExcelTool,
  'to-jpg':        PdfToJpgTool,
  'office-to-pdf': OfficeToPdfTool,
  'ocr':           OcrTool,
};

// Tools that manage their own files (multi-file, non-PDF input, or full screen canvas)
const SELF_MANAGED_TOOLS: ToolId[] = ['merge', 'create', 'office-to-pdf', 'reorganize', 'split'];

const ALL_ITEMS = NAV_GROUPS.flatMap(g => g.items);

// ── Workspace Component ────────────────────────────────────
function Workspace() {
  const {
    pdfDoc, fileName, numPages, isLoading, loadProgress,
    clearFile, arrayBuffer, pageInfos, isEncrypted,
  } = usePdfContext();
  const { overlayRenderer } = useWorkspace();
  const { theme, toggleTheme } = useTheme();

  const [activeTool,      setActiveTool]      = useState<ToolId | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [thumbsVisible,   setThumbsVisible]   = useState(true);
  const [zoom,            setZoom]            = useState(1.0);
  const [currentPage,     setCurrentPage]     = useState(0);
  const [toolPanelOpen,   setToolPanelOpen]   = useState(false);
  const [showRulers,      setShowRulers]      = useState(false);
  const [showSearch,      setShowSearch]      = useState(false);

  const hasDocument  = pdfDoc !== null || isEncrypted;
  const isSelfManaged = activeTool !== null && SELF_MANAGED_TOOLS.includes(activeTool);
  const ActiveComponent = activeTool ? TOOL_COMPONENTS[activeTool] : null;
  const activeItem = activeTool ? ALL_ITEMS.find(i => i.id === activeTool) : null;

  // Auto-open unlock tool when encrypted PDF is loaded
  useEffect(() => {
    if (isEncrypted && activeTool !== 'unlock') {
      setActiveTool('unlock');
      setToolPanelOpen(true);
    }
  }, [isEncrypted, activeTool]);

  // ── Global keyboard shortcuts ─────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;

      // Ctrl+F — search
      if (ctrl && e.key === 'f' && hasDocument && !isEncrypted) {
        e.preventDefault();
        setShowSearch(s => !s);
        return;
      }

      // Ctrl++ / Ctrl+= — zoom in
      if (ctrl && (e.key === '+' || e.key === '=')) {
        e.preventDefault();
        setZoom(z => {
          const steps = [0.25,0.33,0.5,0.67,0.75,0.9,1.0,1.1,1.25,1.5,1.75,2.0,2.5,3.0,4.0];
          const next = steps.find(s => s > z + 0.005);
          return next ?? z;
        });
        return;
      }

      // Ctrl+- — zoom out
      if (ctrl && e.key === '-') {
        e.preventDefault();
        setZoom(z => {
          const steps = [0.25,0.33,0.5,0.67,0.75,0.9,1.0,1.1,1.25,1.5,1.75,2.0,2.5,3.0,4.0];
          const prev = [...steps].reverse().find(s => s < z - 0.005);
          return prev ?? z;
        });
        return;
      }

      // Ctrl+0 — reset zoom
      if (ctrl && e.key === '0') {
        e.preventDefault();
        setZoom(1.0);
        return;
      }

      // Escape — close search or tool panel
      if (e.key === 'Escape') {
        if (showSearch) { setShowSearch(false); return; }
        if (toolPanelOpen) { closeToolPanel(); return; }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [hasDocument, isEncrypted, showSearch, toolPanelOpen]);

  const handleToolClick = useCallback((toolId: ToolId) => {
    setActiveTool(toolId);
    setToolPanelOpen(true);
  }, []);

  const closeToolPanel = useCallback(() => {
    setToolPanelOpen(false);
    setActiveTool(null);
  }, []);

  const handleFitWidth = useCallback(() => {
    if (!pageInfos || pageInfos.length === 0) { setZoom(1.2); return; }
    const leftNav    = sidebarCollapsed ? 52 : 210;
    const rightPanel = toolPanelOpen ? 420 : 0;
    const thumbs     = thumbsVisible && !isEncrypted ? 168 : 0;
    const rulers     = showRulers ? 20 : 0;
    const available  = window.innerWidth - leftNav - rightPanel - thumbs - rulers - 64;
    setZoom(Math.max(0.25, Math.min(4.0, available / pageInfos[0].width)));
  }, [pageInfos, sidebarCollapsed, toolPanelOpen, thumbsVisible, isEncrypted, showRulers]);

  const handleFitPage = useCallback(() => {
    if (!pageInfos || pageInfos.length === 0) { setZoom(0.75); return; }
    const rulers    = showRulers ? 20 : 0;
    const available = window.innerHeight - 44 - 80 - rulers - 64;
    setZoom(Math.max(0.25, Math.min(4.0, available / pageInfos[0].height)));
  }, [pageInfos, showRulers]);

  const handleDownload = useCallback(() => {
    if (!arrayBuffer || !fileName) return;
    const blob = new Blob([arrayBuffer as unknown as BlobPart], { type: 'application/pdf' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [arrayBuffer, fileName]);

  // ── Shared button style ────────────────────────────────────
  const hdrBtn = 'p-1.5 rounded transition-colors text-[#999] hover:text-white hover:bg-white/10';

  return (
    <div
      className="flex flex-col h-screen overflow-hidden transition-theme"
      style={{ background: 'var(--bg-app)', fontFamily: 'var(--font-sans)' }}
    >

      {/* ── Top Header ────────────────────────────────────────── */}
      <header
        className="h-11 flex-shrink-0 flex items-center px-3 gap-2 z-30 border-b"
        style={{
          background: 'var(--bg-sidebar)',
          borderColor: 'rgba(255,255,255,0.06)',
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 select-none mr-2">
          <div className="w-6 h-6 rounded-md flex items-center justify-center bg-[#CC0000] shadow-sm">
            <FileText className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-white font-semibold text-sm tracking-tight">CamePDF</span>
          <span className="text-[#666] text-[10px] border border-[#444] rounded px-1.5 py-0.5 font-normal leading-none">
            Suite
          </span>
        </div>

        {/* Breadcrumb */}
        <div className="flex-1 flex items-center min-w-0">
          {hasDocument && (
            <div className="flex items-center gap-2 text-xs min-w-0 animate-fade-in">
              <span className="text-[#555]">/</span>
              <span className="text-[#CCC] font-medium truncate max-w-[220px]" title={fileName}>
                {fileName}
              </span>
              {numPages > 0 && (
                <>
                  <span className="text-[#444]">·</span>
                  <span className="text-[#666] whitespace-nowrap">{numPages} pág{numPages !== 1 ? 's' : ''}</span>
                </>
              )}
              {activeItem && (
                <>
                  <span className="text-[#444]">›</span>
                  <activeItem.Icon className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                  <span className="text-blue-400 whitespace-nowrap">{activeItem.label}</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Header actions */}
        <div className="flex items-center gap-0.5">
          <button onClick={toggleTheme} className={hdrBtn} title="Cambiar tema">
            {theme === 'dark'
              ? <Sun  className="w-4 h-4" />
              : <Moon className="w-4 h-4" />
            }
          </button>

          {hasDocument && (
            <>
              <button onClick={handleDownload} className={hdrBtn} title="Descargar PDF  (Ctrl+S)">
                <Download className="w-4 h-4" />
              </button>
              <button
                onClick={clearFile}
                className="p-1.5 rounded transition-colors text-[#999] hover:text-red-400 hover:bg-red-500/15"
                title="Cerrar documento"
              >
                <X className="w-4 h-4" />
              </button>
            </>
          )}

          <div className="w-px h-5 bg-white/8 mx-1" />

          <button
            onClick={() => setSidebarCollapsed(s => !s)}
            className={hdrBtn}
            title={sidebarCollapsed ? 'Expandir panel (Ctrl+\\)' : 'Colapsar panel (Ctrl+\\)'}
          >
            {sidebarCollapsed
              ? <ChevronRight className="w-4 h-4" />
              : <ChevronLeft  className="w-4 h-4" />
            }
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* ── Tool Sidebar (left) ──────────────────────────────── */}
        <aside
          className="flex-shrink-0 flex flex-col overflow-y-auto overflow-x-hidden border-r transition-all duration-200"
          style={{
            width: sidebarCollapsed ? 52 : 210,
            background: 'var(--bg-sidebar)',
            borderColor: 'rgba(255,255,255,0.06)',
          }}
        >
          {NAV_GROUPS.map((group, gi) => (
            <div key={group.label} className={gi === 0 ? 'pt-3' : 'pt-1'}>
              {!sidebarCollapsed && (
                <p className="px-3 pb-1 text-[9.5px] font-bold uppercase tracking-[0.1em] text-[#555] select-none">
                  {group.label}
                </p>
              )}
              {sidebarCollapsed && gi > 0 && (
                <div className="mx-3 my-1.5 h-px bg-white/6" />
              )}

              {group.items.map(item => {
                const active = activeTool === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleToolClick(item.id)}
                    title={sidebarCollapsed ? item.label : undefined}
                    className={[
                      'flex items-center w-full text-left transition-all duration-100 relative',
                      sidebarCollapsed
                        ? 'justify-center px-0 py-2.5'
                        : 'gap-2.5 px-3 py-[7px]',
                      active
                        ? 'text-white'
                        : 'text-[#6E6E75] hover:text-[#D0D0D5] hover:bg-white/[0.04]',
                    ].join(' ')}
                  >
                    {/* Active indicator */}
                    {active && !sidebarCollapsed && (
                      <div className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r bg-[#4C8BF5]" />
                    )}
                    {active && (
                      <div
                        className="absolute inset-0 rounded-none"
                        style={{ background: 'rgba(76,139,245,0.12)' }}
                      />
                    )}

                    <item.Icon
                      className="flex-shrink-0 relative z-10"
                      style={{
                        width:  sidebarCollapsed ? 18 : 14,
                        height: sidebarCollapsed ? 18 : 14,
                        color:  active ? '#4C8BF5' : undefined,
                      }}
                    />
                    {!sidebarCollapsed && (
                      <span className="text-[12px] font-medium truncate relative z-10">
                        {item.label}
                      </span>
                    )}
                  </button>
                );
              })}

              {gi < NAV_GROUPS.length - 1 && !sidebarCollapsed && (
                <div className="mx-3 mt-1.5 mb-0.5 h-px bg-white/[0.06]" />
              )}
            </div>
          ))}
          <div className="flex-1 min-h-4" />
        </aside>

        {/* ── Central Area ──────────────────────────────────────── */}
        <div className="flex-1 flex overflow-hidden relative">

          {/* Loading overlay */}
          {isLoading && (
            <div
              className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4"
              style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
            >
              <div className="w-10 h-10 border-3 border-blue-500 border-t-transparent rounded-full animate-spin-smooth" />
              <p className="text-sm font-medium text-white/80">Cargando… {loadProgress}%</p>
              <div className="w-48 bg-white/10 rounded-full h-1">
                <div
                  className="bg-blue-500 h-1 rounded-full transition-all duration-300"
                  style={{ width: `${loadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* State 1: No document */}
          {!hasDocument && !isSelfManaged && <WelcomeDropzone />}

          {/* State 2: Self-managed tool */}
          {isSelfManaged && ActiveComponent && (
            <main
              className="flex-1 overflow-y-auto p-6 transition-theme"
              style={{ background: 'var(--bg-app)' }}
            >
              <div
                className="min-h-full rounded-2xl shadow-md border transition-theme"
                style={{ background: 'var(--bg-panel)', borderColor: 'var(--border-subtle)' }}
              >
                <div className="relative">
                  <button
                    onClick={closeToolPanel}
                    className="absolute top-3 right-3 p-1.5 rounded-lg transition-colors z-10"
                    style={{
                      background: 'var(--bg-hover)',
                      color: 'var(--text-secondary)',
                    }}
                    title="Cerrar herramienta"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <ActiveComponent />
                </div>
              </div>
            </main>
          )}

          {/* State 3: Document loaded (Viewer + Tool Panel) */}
          {hasDocument && !isSelfManaged && (
            <>
              {/* Thumbnail sidebar */}
              {!isEncrypted && (
                <ThumbnailSidebar
                  visible={thumbsVisible}
                  onToggle={() => setThumbsVisible(v => !v)}
                  currentPage={currentPage}
                />
              )}

              {/* Central PDF Viewer or Locked screen */}
              {isEncrypted ? (
                <div
                  className="flex-1 flex flex-col items-center justify-center z-10"
                  style={{ background: 'var(--bg-viewer)' }}
                >
                  <div
                    className="flex flex-col items-center gap-3 p-8 rounded-2xl border animate-scale-in"
                    style={{
                      background: 'var(--bg-panel)',
                      borderColor: 'var(--border-subtle)',
                      boxShadow: 'var(--shadow-md)',
                    }}
                  >
                    <Lock className="w-14 h-14 text-[#555]" />
                    <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                      Documento Protegido
                    </h2>
                    <p className="text-center text-sm max-w-xs" style={{ color: 'var(--text-muted)' }}>
                      Este documento tiene contraseña. Utiliza el panel derecho para desbloquearlo.
                    </p>
                  </div>
                </div>
              ) : (
                <PdfViewer
                  zoom={zoom}
                  onPageVisible={setCurrentPage}
                  renderPageOverlay={overlayRenderer || undefined}
                  showRulers={showRulers}
                  showSearch={showSearch}
                  onCloseSearch={() => setShowSearch(false)}
                />
              )}

              {/* Zoom toolbar */}
              {!isEncrypted && (
                <ZoomToolbar
                  zoom={zoom}
                  onZoomChange={setZoom}
                  onFitWidth={handleFitWidth}
                  onFitPage={handleFitPage}
                  currentPage={currentPage}
                  totalPages={numPages}
                  showRulers={showRulers}
                  onToggleRulers={() => setShowRulers(r => !r)}
                />
              )}

              {/* Right-side Tool Panel */}
              {toolPanelOpen && ActiveComponent && (
                <aside
                  className="flex-shrink-0 w-[420px] overflow-y-auto border-l shadow-xl tool-panel-enter"
                  style={{
                    background: 'var(--bg-panel)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <div className="relative">
                    <button
                      onClick={closeToolPanel}
                      className="absolute top-3 right-3 p-1.5 rounded-lg transition-colors z-10"
                      style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
                      title="Cerrar herramienta  (Esc)"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <ActiveComponent />
                  </div>
                </aside>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Root App ───────────────────────────────────────────────
export default function App() {
  return (
    <ThemeProvider>
      <PdfProvider>
        <WorkspaceProvider>
          <Workspace />
        </WorkspaceProvider>
      </PdfProvider>
    </ThemeProvider>
  );
}
