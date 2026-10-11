/**
 * savedSignatures.ts
 * Firmas que el usuario decide recordar, guardadas solo en este navegador (localStorage).
 * Nunca se envían al servidor. El acceso a localStorage puede fallar (modo privado,
 * almacenamiento bloqueado o lleno), así que todo va en try/catch y la firma
 * funciona igual sin guardarse.
 */

export interface SavedSignature {
  id: string;
  /** Imagen PNG de la firma como data URL */
  dataUrl: string;
  createdAt: number;
}

const STORAGE_KEY = 'camepdf.signatures';
const MAX_SAVED = 3;

export function loadSavedSignatures(): SavedSignature[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s): s is SavedSignature =>
      typeof s?.id === 'string' && typeof s?.dataUrl === 'string' && s.dataUrl.startsWith('data:image/png'));
  } catch {
    return [];
  }
}

function store(list: SavedSignature[]): SavedSignature[] {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Sin almacenamiento disponible: la firma se usa igual, solo no se recuerda
  }
  return list;
}

/** Guarda una firma (la más reciente primero; se conservan como máximo MAX_SAVED). */
export function saveSignature(dataUrl: string): SavedSignature[] {
  const others = loadSavedSignatures().filter(s => s.dataUrl !== dataUrl);
  const entry: SavedSignature = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, dataUrl, createdAt: Date.now() };
  return store([entry, ...others].slice(0, MAX_SAVED));
}

export function deleteSignature(id: string): SavedSignature[] {
  return store(loadSavedSignatures().filter(s => s.id !== id));
}
