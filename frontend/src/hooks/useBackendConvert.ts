import { useState } from 'react';
import { BACKEND_URL } from '../config/api';


type ConversionEndpoint =
  | '/api/compress'
  | '/api/to-word'
  | '/api/to-pptx'
  | '/api/to-excel'
  | '/api/to-jpg'
  | '/api/redact';

interface UseBackendConvertOptions {
  endpoint: ConversionEndpoint;
  extraFields?: Record<string, string>;
}

export const useBackendConvert = ({ endpoint, extraFields = {} }: UseBackendConvertOptions) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const convert = async (file: File): Promise<Blob | null> => {
    setIsProcessing(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      for (const [key, value] of Object.entries(extraFields)) {
        formData.append(key, value);
      }

      const response = await fetch(`${BACKEND_URL}${endpoint}`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ detail: `Error ${response.status}` }));
        throw new Error(errData.detail || `Error del servidor: ${response.status}`);
      }

      return await response.blob();
    } catch (err: any) {
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

  const convertWithExtra = async (file: File, extra: Record<string, string>): Promise<Blob | null> => {
    setIsProcessing(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      for (const [key, value] of Object.entries({ ...extraFields, ...extra })) {
        formData.append(key, value);
      }

      const response = await fetch(`${BACKEND_URL}${endpoint}`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ detail: `Error ${response.status}` }));
        throw new Error(errData.detail || `Error del servidor: ${response.status}`);
      }

      return await response.blob();
    } catch (err: any) {
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

  return { convert, convertWithExtra, isProcessing, error };
};
