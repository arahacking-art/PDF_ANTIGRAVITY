import React, { useState, useRef, useEffect } from 'react';
import {
  ZoomIn, ZoomOut, Maximize2, ArrowLeftRight, RotateCcw,
  ChevronDown, Ruler
} from 'lucide-react';

interface ZoomToolbarProps {
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onFitWidth: () => void;
  onFitPage: () => void;
  currentPage: number;
  totalPages: number;
  showRulers: boolean;
  onToggleRulers: () => void;
}

const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 4.0];
const ZOOM_PRESETS = [
  { label: '25%',  value: 0.25 },
  { label: '50%',  value: 0.50 },
  { label: '75%',  value: 0.75 },
  { label: '100%', value: 1.00 },
  { label: '125%', value: 1.25 },
  { label: '150%', value: 1.50 },
  { label: '200%', value: 2.00 },
  { label: '300%', value: 3.00 },
  { label: '400%', value: 4.00 },
];

/**
 * Floating zoom toolbar at the bottom-center of the workspace.
 * Premium glassmorphism design with zoom dropdown, rulers toggle,
 * fit-width, fit-page, and page indicator.
 */
const ZoomToolbar: React.FC<ZoomToolbarProps> = ({
  zoom, onZoomChange, onFitWidth, onFitPage,
  currentPage, totalPages, showRulers, onToggleRulers,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const zoomPct = Math.round(zoom * 100);

  const zoomIn = () => {
    const next = ZOOM_STEPS.find(s => s > zoom + 0.005);
    if (next) onZoomChange(next);
  };

  const zoomOut = () => {
    const prev = [...ZOOM_STEPS].reverse().find(s => s < zoom - 0.005);
    if (prev) onZoomChange(prev);
  };

  const canZoomIn  = zoom < ZOOM_STEPS[ZOOM_STEPS.length - 1] - 0.005;
  const canZoomOut = zoom > ZOOM_STEPS[0] + 0.005;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Focus input when editing starts
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.select();
    }
  }, [editing]);

  const startEditing = () => {
    setEditValue(String(zoomPct));
    setEditing(true);
    setDropdownOpen(false);
  };

  const commitEdit = () => {
    const parsed = parseInt(editValue, 10);
    if (!isNaN(parsed) && parsed >= 10 && parsed <= 400) {
      onZoomChange(parsed / 100);
    }
    setEditing(false);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commitEdit();
    if (e.key === 'Escape') setEditing(false);
  };

  const btnBase =
    'flex items-center justify-center w-7 h-7 rounded-md transition-all duration-100 ' +
    'text-[#B0B0B0] hover:text-white hover:bg-white/12 disabled:opacity-25 ' +
    'disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-[#B0B0B0]';

  const divider = <div className="w-px h-5 bg-white/10 mx-0.5 flex-shrink-0" />;

  return (
    <div
      className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30
                 flex items-center gap-0.5
                 bg-[#1E1E20]/90 border border-white/[0.08]
                 rounded-xl px-2 py-1.5
                 shadow-[0_8px_32px_rgba(0,0,0,0.55),0_2px_8px_rgba(0,0,0,0.35)]
                 zoom-toolbar"
    >
      {/* Page indicator */}
      <span className="text-[11px] text-[#888] font-medium px-2 border-r border-white/10 mr-0.5 select-none tabular-nums whitespace-nowrap">
        {currentPage + 1} <span className="text-[#555]">/</span> {totalPages}
      </span>

      {/* Zoom out */}
      <button
        onClick={zoomOut}
        disabled={!canZoomOut}
        className={btnBase}
        title="Reducir zoom  (Ctrl+-)"
      >
        <ZoomOut className="w-3.5 h-3.5" />
      </button>

      {/* Zoom percentage — click to edit, click arrow to open dropdown */}
      <div className="relative" ref={dropdownRef}>
        <div className="flex items-center rounded-md overflow-hidden">
          {editing ? (
            <input
              ref={inputRef}
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={handleEditKeyDown}
              className="w-14 text-center text-[12px] font-bold text-white bg-white/10 border border-white/20 rounded-md px-1 py-0.5 outline-none"
              type="text"
              inputMode="numeric"
            />
          ) : (
            <>
              <button
                onClick={startEditing}
                className="text-[12px] font-bold text-white min-w-[40px] text-center px-1.5 py-0.5
                           hover:bg-white/10 rounded-l-md transition-colors"
                title="Haz clic para editar el zoom"
              >
                {zoomPct}%
              </button>
              <button
                onClick={() => setDropdownOpen(o => !o)}
                className={`px-0.5 py-0.5 hover:bg-white/10 rounded-r-md transition-colors ${dropdownOpen ? 'bg-white/10' : ''}`}
                title="Seleccionar nivel de zoom"
              >
                <ChevronDown className={`w-3 h-3 text-[#888] transition-transform duration-150 ${dropdownOpen ? 'rotate-180' : ''}`} />
              </button>
            </>
          )}
        </div>

        {/* Dropdown */}
        {dropdownOpen && (
          <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2
                          bg-[#252527] border border-white/12 rounded-lg shadow-xl
                          overflow-hidden min-w-[110px] animate-fade-in z-50">
            {ZOOM_PRESETS.map(preset => (
              <button
                key={preset.value}
                onClick={() => { onZoomChange(preset.value); setDropdownOpen(false); }}
                className={`
                  w-full text-left px-3 py-1.5 text-[12px] font-medium transition-colors
                  ${Math.abs(zoom - preset.value) < 0.005
                    ? 'bg-white/10 text-white'
                    : 'text-[#AEAEB2] hover:bg-white/08 hover:text-white'
                  }
                `}
              >
                {preset.label}
              </button>
            ))}
            <div className="border-t border-white/10 my-0.5" />
            <button
              onClick={() => { onFitWidth(); setDropdownOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-[12px] font-medium text-[#AEAEB2] hover:bg-white/08 hover:text-white transition-colors"
            >
              Ajustar ancho
            </button>
            <button
              onClick={() => { onFitPage(); setDropdownOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-[12px] font-medium text-[#AEAEB2] hover:bg-white/08 hover:text-white transition-colors"
            >
              Ajustar página
            </button>
          </div>
        )}
      </div>

      {/* Zoom in */}
      <button
        onClick={zoomIn}
        disabled={!canZoomIn}
        className={btnBase}
        title="Aumentar zoom  (Ctrl++)"
      >
        <ZoomIn className="w-3.5 h-3.5" />
      </button>

      {divider}

      {/* Fit width */}
      <button onClick={onFitWidth} className={btnBase} title="Ajustar al ancho  (Ctrl+Shift+H)">
        <ArrowLeftRight className="w-3.5 h-3.5" />
      </button>

      {/* Fit page */}
      <button onClick={onFitPage} className={btnBase} title="Ajustar a la página  (Ctrl+Shift+F)">
        <Maximize2 className="w-3.5 h-3.5" />
      </button>

      {/* Reset zoom */}
      <button onClick={() => onZoomChange(1.0)} className={btnBase} title="Zoom 100%  (Ctrl+0)">
        <RotateCcw className="w-3.5 h-3.5" />
      </button>

      {divider}

      {/* Rulers toggle */}
      <button
        onClick={onToggleRulers}
        className={`${btnBase} ${showRulers ? '!text-[var(--accent)] !bg-[var(--accent-subtle)]' : ''}`}
        title={showRulers ? 'Ocultar reglas' : 'Mostrar reglas'}
      >
        <Ruler className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

export default ZoomToolbar;
