import { useState } from 'react';

const BACKEND_URL = 'http://localhost:8000';

export interface PageRender {
  index: number;
  width: number;          // rendered pixel width
  height: number;         // rendered pixel height
  originalWidth: number;  // PDF coordinate width (points)
  originalHeight: number; // PDF coordinate height (points)
  data: string;           // base64 PNG
}

export const usePdfRenderer = () => {
  const [pages, setPages] = useState<PageRender[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const renderPages = async (file: File, scale = 1.5): Promise<PageRender[]> => {
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('scale', scale.toString());
      const response = await fetch(`${BACKEND_URL}/api/render-pages`, {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: 'Error al cargar el PDF' }));
        throw new Error(err.detail);
      }
      const data = await response.json();
      setPages(data.pages);
      return data.pages;
    } catch (err: any) {
      if (err instanceof TypeError) {
        setError('No se pudo conectar al servidor. Verifica que el backend esté activo.');
      } else {
        setError(err.message || 'Error al renderizar el PDF.');
      }
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  const reset = () => {
    setPages([]);
    setError(null);
  };

  return { pages, isLoading, error, renderPages, reset };
};
