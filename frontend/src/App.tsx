import React, { useState, useCallback } from 'react';
import {
  GitMerge, Scissors, LayoutGrid, RotateCw, Minimize2,
  FilePlus2, PenLine, Droplets, EyeOff, ShieldCheck, ShieldOff,
  FileText, Monitor, Table2, Image, FileUp, ScanText,
  ChevronLeft, ChevronRight, X, Download, Sun, Moon,
  Type, CheckSquare
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

interface NavItem { id: ToolId; label: string; Icon: React.FC<any>; }
interface NavGroup { label: string; items: NavItem[]; }

// ── Navigation config ─────────────────────────────────────
const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Organizar',
    items: [
      { id: 'merge',      label: 'Unir PDFs',      Icon: GitMerge   },
      { id: 'split',      label: 'Extraer Páginas', Icon: Scissors   },
      { id: 'reorganize', label: 'Reorganizar',      Icon: LayoutGrid },
      { id: 'rotate',     label: 'Rotar',            Icon: RotateCw   },
      { id: 'compress',   label: 'Comprimir',        Icon: Minimize2  },
    ],
  },
  {
    label: 'Editar',
    items: [
      { id: 'create',    label: 'Crear PDF',     Icon: FilePlus2 },
      { id: 'annotate',  label: 'Anotar',         Icon: Type      },
      { id: 'form',      label: 'Formularios',    Icon: CheckSquare },
      { id: 'sign',      label: 'Firmar',         Icon: PenLine   },
      { id: 'watermark', label: 'Marca de Agua',  Icon: Droplets  },
      { id: 'redact',    label: 'Censurar',       Icon: EyeOff    },
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
      { id: 'to-word',  label: 'PDF a Word',        Icon: FileText },
      { id: 'to-pptx',  label: 'PDF a PowerPoint',  Icon: Monitor  },
      { id: 'to-excel', label: 'PDF a Excel',        Icon: Table2   },
      { id: 'to-jpg',   label: 'PDF a JPG',          Icon: Image    },
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

// Tools that manage their own files (multi-file, non-PDF input, or require full screen canvas)
const SELF_MANAGED_TOOLS: ToolId[] = ['merge', 'create', 'office-to-pdf', 'reorganize', 'split'];

const ALL_ITEMS = NAV_GROUPS.flatMap(g => g.items);

// ── Main Workspace Component ────────────────────────────────
function Workspace() {
  const { pdfDoc, fileName, numPages, isLoading, loadProgress, clearFile, arrayBuffer, pageInfos } = usePdfContext();
  const { overlayRenderer } = useWorkspace();
  const { theme, toggleTheme } = useTheme();

  const [activeTool, setActiveTool] = useState<ToolId | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [thumbsVisible, setThumbsVisible] = useState(true);
  const [zoom, setZoom] = useState(1.0);
  const [currentPage, setCurrentPage] = useState(0);
  const [toolPanelOpen, setToolPanelOpen] = useState(false);

  const hasDocument = pdfDoc !== null;
  const isSelfManaged = activeTool !== null && SELF_MANAGED_TOOLS.includes(activeTool);
  const ActiveComponent = activeTool ? TOOL_COMPONENTS[activeTool] : null;
  const activeItem = activeTool ? ALL_ITEMS.find(i => i.id === activeTool) : null;

  const handleToolClick = useCallback((toolId: ToolId) => {
    setActiveTool(toolId);
    setToolPanelOpen(true);
  }, []);

  const closeToolPanel = useCallback(() => {
    setToolPanelOpen(false);
    setActiveTool(null);
  }, []);

  const handleFitWidth = useCallback(() => {
    if (!pageInfos || pageInfos.length === 0) {
      setZoom(1.2);
      return;
    }
    const leftNav = sidebarCollapsed ? 52 : 210;
    const rightPanel = toolPanelOpen ? 420 : 0;
    const thumbs = thumbsVisible ? 160 : 0;
    const availableWidth = window.innerWidth - leftNav - rightPanel - thumbs - 64; // 64px margin
    const firstPageWidth = pageInfos[0].width;
    const newZoom = Math.max(0.25, Math.min(4.0, availableWidth / firstPageWidth));
    setZoom(newZoom);
  }, [pageInfos, sidebarCollapsed, toolPanelOpen, thumbsVisible]);

  const handleFitPage = useCallback(() => {
    if (!pageInfos || pageInfos.length === 0) {
      setZoom(0.75);
      return;
    }
    const topHeader = 44;
    const bottomToolbar = 80;
    const availableHeight = window.innerHeight - topHeader - bottomToolbar - 64; // 64px margin
    const firstPageHeight = pageInfos[0].height;
    const newZoom = Math.max(0.25, Math.min(4.0, availableHeight / firstPageHeight));
    setZoom(newZoom);
  }, [pageInfos]);

  const handleDownload = useCallback(() => {
    if (!arrayBuffer || !fileName) return;
    const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [arrayBuffer, fileName]);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-300 dark:bg-gray-900 transition-colors" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* ── Top Header ─────────────────────────────────────── */}
      <header className="h-11 flex-shrink-0 bg-[#2C2C2C] dark:bg-black flex items-center px-4 gap-3 border-b border-black/30 z-30 transition-colors">
        {/* Logo */}
        <div className="flex items-center gap-2 select-none">
          <div className="w-6 h-6 rounded flex items-center justify-center bg-[#CC0000]">
            <FileText className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-white font-bold text-sm tracking-tight">PDF Antigravity</span>
          <span className="text-[#888] text-xs border border-[#555] rounded px-1.5 py-0.5 ml-1 font-normal">
            Suite
          </span>
        </div>

        {/* Breadcrumb / file info */}
        <div className="flex-1 flex items-center">
          {hasDocument && (
            <div className="flex items-center gap-2 ml-4 text-[#aaa] text-xs">
              <span className="text-[#666]">/</span>
              <span className="text-[#ccc] font-medium truncate max-w-xs">{fileName}</span>
              <span className="text-[#555]">·</span>
              <span>{numPages} pág{numPages !== 1 ? 's' : ''}</span>
              {activeItem && (
                <>
                  <span className="text-[#555]">›</span>
                  <activeItem.Icon className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-blue-400">{activeItem.label}</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Header actions */}
        <div className="flex items-center gap-1">
          <button
            onClick={toggleTheme}
            className="p-1.5 rounded hover:bg-white/10 transition-colors text-[#aaa] hover:text-white mr-2"
            title="Cambiar tema"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          {hasDocument && (
            <>
              <button
                onClick={handleDownload}
                className="p-1.5 rounded hover:bg-white/10 transition-colors text-[#aaa] hover:text-white"
                title="Descargar PDF"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                onClick={clearFile}
                className="p-1.5 rounded hover:bg-red-500/20 transition-colors text-[#aaa] hover:text-red-400"
                title="Cerrar documento"
              >
                <X className="w-4 h-4" />
              </button>
            </>
          )}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-1.5 rounded hover:bg-white/10 transition-colors text-[#aaa] hover:text-white"
            title={sidebarCollapsed ? 'Expandir panel' : 'Colapsar panel'}
          >
            {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* ── Tool Sidebar (left) ──────────────────────────── */}
        <aside
          className="flex-shrink-0 bg-[#1E1E1E] dark:bg-[#111] flex flex-col overflow-y-auto overflow-x-hidden border-r border-black/30 transition-all duration-200"
          style={{ width: sidebarCollapsed ? 52 : 210 }}
        >
          {NAV_GROUPS.map((group, gi) => (
            <div key={group.label} className={gi === 0 ? 'pt-3' : 'pt-1'}>
              {!sidebarCollapsed && (
                <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-[#777] select-none">
                  {group.label}
                </p>
              )}
              {sidebarCollapsed && gi > 0 && (
                <div className="mx-3 my-2 h-px bg-[#333]" />
              )}

              {group.items.map(item => {
                const active = activeTool === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleToolClick(item.id)}
                    title={sidebarCollapsed ? item.label : undefined}
                    className={[
                      'flex items-center w-full text-left transition-colors duration-100',
                      sidebarCollapsed ? 'justify-center px-0 py-2.5' : 'gap-2.5 px-3 py-2',
                      active
                        ? 'bg-[#0F3F7A] text-white border-l-2 border-[#3B82F6]'
                        : 'text-[#9CA3AF] hover:text-white hover:bg-white/5 border-l-2 border-transparent',
                      sidebarCollapsed && active ? 'border-l-0 border-b-2 border-[#3B82F6]' : '',
                    ].join(' ')}
                    style={!sidebarCollapsed && active ? { paddingLeft: 10 } : {}}
                  >
                    <item.Icon className="flex-shrink-0" style={{ width: sidebarCollapsed ? 18 : 15, height: sidebarCollapsed ? 18 : 15 }} />
                    {!sidebarCollapsed && (
                      <span className="text-xs font-medium truncate">{item.label}</span>
                    )}
                  </button>
                );
              })}

              {gi < NAV_GROUPS.length - 1 && !sidebarCollapsed && (
                <div className="mx-3 mt-2 mb-1 h-px bg-[#3A3A3A]" />
              )}
            </div>
          ))}
          <div className="flex-1 min-h-4" />
        </aside>

        {/* ── Central Area ────────────────────────────────── */}
        <div className="flex-1 flex overflow-hidden relative">

          {/* Loading overlay */}
          {isLoading && (
            <div className="absolute inset-0 bg-gray-300/90 dark:bg-gray-900/90 z-40 flex flex-col items-center justify-center gap-4">
              <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Cargando documento… {loadProgress}%</p>
              <div className="w-48 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${loadProgress}%` }} />
              </div>
            </div>
          )}

          {/* State 1: No document and no self-managed tool active */}
          {!hasDocument && !isSelfManaged && (
            <WelcomeDropzone />
          )}

          {/* State 2: Self-managed tool active (takes over entire central area) */}
          {isSelfManaged && ActiveComponent && (
            <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 bg-gray-300 dark:bg-gray-900 transition-colors">
              <div className="min-h-full bg-gray-100 dark:bg-gray-800 rounded-2xl shadow-md border border-gray-300 dark:border-gray-700 transition-colors">
                <div className="relative">
                  <button
                    onClick={closeToolPanel}
                    className="absolute top-3 right-3 p-1.5 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600 hover:text-gray-700 dark:hover:text-gray-200 transition-colors z-10"
                    title="Cerrar herramienta"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <ActiveComponent />
                </div>
              </div>
            </main>
          )}

          {/* State 3: Document loaded, and normal tool active (Viewer + Panel) */}
          {hasDocument && !isSelfManaged && (
            <>
              {/* Thumbnail sidebar */}
              <ThumbnailSidebar
                visible={thumbsVisible}
                onToggle={() => setThumbsVisible(!thumbsVisible)}
                currentPage={currentPage}
              />

              {/* Central PDF Viewer */}
              <PdfViewer
                zoom={zoom}
                onPageVisible={setCurrentPage}
                renderPageOverlay={overlayRenderer || undefined}
              />

              {/* Zoom toolbar */}
              <ZoomToolbar
                zoom={zoom}
                onZoomChange={setZoom}
                onFitWidth={handleFitWidth}
                onFitPage={handleFitPage}
                currentPage={currentPage}
                totalPages={numPages}
              />

              {/* Right-side Tool Panel */}
              {toolPanelOpen && ActiveComponent && (
                <aside className="flex-shrink-0 w-[420px] bg-gray-100 dark:bg-gray-800 border-l border-gray-300 dark:border-gray-700 overflow-y-auto shadow-xl transition-all duration-200">
                  <div className="relative">
                    {/* Close button */}
                    <button
                      onClick={closeToolPanel}
                      className="absolute top-3 right-3 p-1.5 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600 hover:text-gray-700 dark:hover:text-gray-200 transition-colors z-10"
                      title="Cerrar herramienta"
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

// ── Root App (wraps everything in PdfProvider) ────────────
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
