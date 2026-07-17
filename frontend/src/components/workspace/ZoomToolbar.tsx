import React from 'react';
import { ZoomIn, ZoomOut, Maximize2, ArrowLeftRight, RotateCcw } from 'lucide-react';

interface ZoomToolbarProps {
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onFitWidth: () => void;
  onFitPage: () => void;
  currentPage: number;
  totalPages: number;
}

const ZOOM_STEPS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0, 4.0];

/**
 * Floating zoom toolbar at the bottom of the workspace.
 * Controls: Zoom In/Out, Fit Width, Fit Page, Reset, and current page indicator.
 */
const ZoomToolbar: React.FC<ZoomToolbarProps> = ({
  zoom, onZoomChange, onFitWidth, onFitPage, currentPage, totalPages
}) => {
  const zoomIn = () => {
    const next = ZOOM_STEPS.find(s => s > zoom + 0.01);
    if (next) onZoomChange(next);
  };

  const zoomOut = () => {
    const prev = [...ZOOM_STEPS].reverse().find(s => s < zoom - 0.01);
    if (prev) onZoomChange(prev);
  };

  const canZoomIn = zoom < ZOOM_STEPS[ZOOM_STEPS.length - 1];
  const canZoomOut = zoom > ZOOM_STEPS[0];

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 bg-[#2C2C2C] rounded-xl px-2 py-1.5 shadow-2xl border border-[#444]">
      {/* Page indicator */}
      <span className="text-[11px] text-gray-300 font-medium px-2 border-r border-[#444] mr-1 select-none">
        {currentPage + 1} / {totalPages}
      </span>

      {/* Zoom out */}
      <button
        onClick={zoomOut}
        disabled={!canZoomOut}
        className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
        title="Reducir zoom"
      >
        <ZoomOut className="w-4 h-4" />
      </button>

      {/* Zoom percentage */}
      <span className="text-[11px] text-gray-200 font-bold min-w-[42px] text-center select-none">
        {Math.round(zoom * 100)}%
      </span>

      {/* Zoom in */}
      <button
        onClick={zoomIn}
        disabled={!canZoomIn}
        className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
        title="Aumentar zoom"
      >
        <ZoomIn className="w-4 h-4" />
      </button>

      <div className="w-px h-5 bg-[#444] mx-1" />

      {/* Fit width */}
      <button
        onClick={onFitWidth}
        className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
        title="Ajustar al ancho"
      >
        <ArrowLeftRight className="w-4 h-4" />
      </button>

      {/* Fit page */}
      <button
        onClick={onFitPage}
        className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
        title="Ajustar a la página"
      >
        <Maximize2 className="w-4 h-4" />
      </button>

      {/* Reset zoom */}
      <button
        onClick={() => onZoomChange(1.0)}
        className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
        title="Zoom 100%"
      >
        <RotateCcw className="w-4 h-4" />
      </button>
    </div>
  );
};

export default ZoomToolbar;
