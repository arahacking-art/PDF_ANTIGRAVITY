import { useState } from 'react';
import { BACKEND_URL } from '../config/api';


type SecurityAction = 'protect' | 'unlock';

export const usePdfSecurity = (action: SecurityAction) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processWithPassword = async (
    file: File,
    password: string
  ): Promise<Blob | null> => {
    setIsProcessing(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('password', password);

      const endpoint = action === 'protect' ? '/api/protect' : '/api/unlock';

      const response = await fetch(`${BACKEND_URL}${endpoint}`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Error desconocido del servidor.' }));
        throw new Error(errorData.detail || `Error del servidor: ${response.status}`);
      }

      return await response.blob();
    } catch (err: any) {
      console.error(err);
      // Distinguir errores de red del backend
      if (err instanceof TypeError && err.message === 'Failed to fetch') {
        setError('No se pudo conectar al servidor. Verifica que el backend esté activo en el puerto 8000.');
      } else {
        setError(err.message || 'Error inesperado.');
      }
      return null;
    } finally {
      setIsProcessing(false);
    }
  };

  return { processWithPassword, isProcessing, error };
};
