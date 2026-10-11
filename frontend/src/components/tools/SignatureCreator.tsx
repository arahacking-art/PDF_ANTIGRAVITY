import React, { useCallback, useEffect, useRef, useState } from 'react';
import '@fontsource/great-vibes/latin-400.css';
import '@fontsource/dancing-script/latin-400.css';
import Dropzone from '../ui/Dropzone';
import Button from '../ui/Button';
import {
  loadSavedSignatures, saveSignature, deleteSignature, type SavedSignature,
} from '../../utils/savedSignatures';

type Mode = 'draw' | 'type' | 'upload';

const MODES: { id: Mode; label: string }[] = [
  { id: 'draw',   label: 'Dibujar' },
  { id: 'type',   label: 'Escribir' },
  { id: 'upload', label: 'Subir imagen' },
];

const INK_COLORS = [
  { label: 'Negro', value: '#111111' },
  { label: 'Azul',  value: '#1A3D9C' },
];

// Fuentes manuscritas servidas desde la propia app (@fontsource): sin dependencias externas
const SIGNATURE_FONTS = ['Great Vibes', 'Dancing Script'];

/** Recorta los márgenes vacíos (transparentes) y devuelve un PNG, o null si no hay nada dibujado. */
function trimToPng(source: HTMLCanvasElement, padding = 8): string | null {
  const ctx = source.getContext('2d');
  if (!ctx) return null;
  const { width, height } = source;
  const data = ctx.getImageData(0, 0, width, height).data;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  minX = Math.max(0, minX - padding); minY = Math.max(0, minY - padding);
  maxX = Math.min(width - 1, maxX + padding); maxY = Math.min(height - 1, maxY + padding);
  const out = document.createElement('canvas');
  out.width = maxX - minX + 1;
  out.height = maxY - minY + 1;
  out.getContext('2d')!.drawImage(source, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}

/** Dibuja un nombre con una fuente manuscrita y lo devuelve como PNG recortado. */
async function renderTypedSignature(text: string, font: string, color: string): Promise<string | null> {
  const fontSpec = `96px "${font}"`;
  await document.fonts.load(fontSpec, text);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  ctx.font = fontSpec;
  canvas.width = Math.ceil(ctx.measureText(text).width) + 80;
  canvas.height = 180;
  ctx.font = fontSpec; // cambiar el tamaño del canvas reinicia el contexto
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 40, canvas.height / 2);
  return trimToPng(canvas);
}

/** Convierte una imagen subida a PNG (máx. 1200 px de ancho), conservando la transparencia. */
function imageFileToPng(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1200 / img.naturalWidth);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
    img.src = url;
  });
}

// ── Lienzo para dibujar la firma ─────────────────────────────
const DrawPad: React.FC<{ color: string; onChange: (canvas: HTMLCanvasElement | null) => void }> = ({ color, onChange }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastRef = useRef<{ x: number; y: number } | null>(null);

  // Tamaño interno según el ancho real y la densidad de píxeles (trazo nítido)
  useEffect(() => {
    const canvas = canvasRef.current!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.5;
  }, []);

  const point = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    canvasRef.current!.setPointerCapture(e.pointerId);
    lastRef.current = point(e);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!lastRef.current) return;
    const ctx = canvasRef.current!.getContext('2d')!;
    const p = point(e);
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(lastRef.current.x, lastRef.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastRef.current = p;
  };

  const onPointerUp = () => {
    if (!lastRef.current) return;
    lastRef.current = null;
    onChange(canvasRef.current);
  };

  const clear = () => {
    const canvas = canvasRef.current!;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    onChange(null);
  };

  return (
    <div className="space-y-2">
      <div className="paper relative bg-white rounded-lg border-2 border-dashed border-gray-300">
        <canvas
          ref={canvasRef}
          className="block w-full h-40 cursor-crosshair touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        {/* Línea guía; color fijo porque el lienzo siempre es blanco, también en modo oscuro */}
        <div className="absolute left-6 right-6 bottom-8 border-b pointer-events-none" style={{ borderColor: '#D1D5DB' }} />
      </div>
      <div className="flex justify-between items-center">
        <p className="text-xs text-gray-500">Firma con el ratón, el dedo o un lápiz táctil.</p>
        <button onClick={clear} className="text-sm text-gray-600 hover:text-gray-900 hover:underline">Borrar</button>
      </div>
    </div>
  );
};

// ── Creador de firmas ─────────────────────────────────────────
interface SignatureCreatorProps {
  /** Se llama con la firma elegida como PNG (data URL) */
  onSelect: (dataUrl: string) => void;
}

/**
 * Permite elegir una firma guardada o crear una nueva dibujándola, escribiéndola
 * con una fuente manuscrita o subiendo una imagen.
 */
const SignatureCreator: React.FC<SignatureCreatorProps> = ({ onSelect }) => {
  const [saved, setSaved] = useState<SavedSignature[]>(loadSavedSignatures);
  const [mode, setMode] = useState<Mode>('draw');
  const [color, setColor] = useState(INK_COLORS[0].value);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [drawnCanvas, setDrawnCanvas] = useState<HTMLCanvasElement | null>(null);
  const [typedName, setTypedName] = useState('');
  const [typedFont, setTypedFont] = useState(SIGNATURE_FONTS[0]);
  const [uploadedPng, setUploadedPng] = useState<string | null>(null);

  const canUse =
    (mode === 'draw' && drawnCanvas !== null) ||
    (mode === 'type' && typedName.trim() !== '') ||
    (mode === 'upload' && uploadedPng !== null);

  const handleUpload = useCallback(async (files: File[]) => {
    if (!files[0]) return;
    setError(null);
    try {
      setUploadedPng(await imageFileToPng(files[0]));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const handleUse = async () => {
    setError(null);
    let dataUrl: string | null = null;
    if (mode === 'draw' && drawnCanvas) dataUrl = trimToPng(drawnCanvas);
    if (mode === 'type') dataUrl = await renderTypedSignature(typedName.trim(), typedFont, color);
    if (mode === 'upload') dataUrl = uploadedPng;
    if (!dataUrl) { setError('La firma está vacía.'); return; }
    if (remember) saveSignature(dataUrl);
    onSelect(dataUrl);
  };

  return (
    <div className="space-y-5">
      {saved.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-gray-700">Tus firmas guardadas</h2>
          <div className="space-y-2">
            {saved.map(sig => (
              <div key={sig.id} className="flex items-center gap-3 p-2 rounded-lg border border-gray-200 hover:border-blue-400">
                <button onClick={() => onSelect(sig.dataUrl)} className="paper flex-1 h-14 bg-white rounded flex items-center justify-center" title="Usar esta firma">
                  <img src={sig.dataUrl} alt="Firma guardada" className="max-h-12 max-w-full object-contain" />
                </button>
                <div className="flex flex-col gap-1 items-end">
                  <Button size="sm" onClick={() => onSelect(sig.dataUrl)}>Usar</Button>
                  <button onClick={() => setSaved(deleteSignature(sig.id))} className="text-xs text-red-600 hover:underline">Eliminar</button>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 pt-1">O crea una nueva:</p>
        </div>
      )}

      {/* Modo de creación */}
      <div className="grid grid-cols-3 gap-1 p-1 bg-gray-100 rounded-lg">
        {MODES.map(m => (
          <button
            key={m.id}
            onClick={() => { setMode(m.id); setError(null); }}
            className={[
              'py-1.5 rounded-md text-sm font-medium transition-colors',
              mode === m.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700',
            ].join(' ')}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode !== 'upload' && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">Color de tinta:</span>
          {INK_COLORS.map(c => (
            <button
              key={c.value}
              onClick={() => { setColor(c.value); setDrawnCanvas(null); }}
              className={[
                'flex items-center gap-1.5 px-2 py-1 rounded-md border text-sm',
                color === c.value ? 'border-blue-500 text-gray-900' : 'border-gray-200 text-gray-600',
              ].join(' ')}
            >
              <span className="w-3 h-3 rounded-full" style={{ background: c.value, boxShadow: '0 0 0 1px #9CA3AF' }} />
              {c.label}
            </button>
          ))}
        </div>
      )}

      {/* El lienzo se monta de nuevo al cambiar de color para no mezclar tintas */}
      {mode === 'draw' && <DrawPad key={color} color={color} onChange={setDrawnCanvas} />}

      {mode === 'type' && (
        <div className="space-y-3">
          <input
            type="text"
            value={typedName}
            onChange={e => setTypedName(e.target.value)}
            placeholder="Escribe tu nombre"
            maxLength={60}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
          <div className="space-y-2">
            {SIGNATURE_FONTS.map(font => (
              <button
                key={font}
                onClick={() => setTypedFont(font)}
                className={[
                  'paper w-full h-16 px-4 bg-white rounded-lg border-2 text-left text-3xl truncate',
                  typedFont === font ? 'border-blue-500' : 'border-gray-200 hover:border-gray-300',
                ].join(' ')}
                style={{ fontFamily: `"${font}", cursive`, color }}
              >
                {typedName.trim() || 'Tu nombre'}
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === 'upload' && (
        uploadedPng ? (
          <div className="space-y-2">
            <div className="paper h-28 bg-white rounded-lg border border-gray-200 flex items-center justify-center p-2">
              <img src={uploadedPng} alt="Firma subida" className="max-h-full max-w-full object-contain" />
            </div>
            <button onClick={() => setUploadedPng(null)} className="text-sm text-gray-600 hover:text-gray-900 hover:underline">
              Elegir otra imagen
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-gray-500">PNG con fondo transparente recomendado.</p>
            <Dropzone onFilesSelected={handleUpload} accept={{ 'image/png': ['.png'], 'image/jpeg': ['.jpg', '.jpeg'] }} multiple={false} />
          </div>
        )
      )}

      {error && <div className="p-3 text-sm text-red-700 bg-red-50 rounded-lg border border-red-200">{error}</div>}

      <div className="flex items-center justify-between gap-3 pt-3 border-t border-gray-200">
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
          <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} className="accent-blue-600" />
          Recordar en este navegador
        </label>
        <Button onClick={handleUse} disabled={!canUse}>Usar esta firma</Button>
      </div>
    </div>
  );
};

export default SignatureCreator;
