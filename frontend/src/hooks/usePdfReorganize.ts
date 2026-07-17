import { useState } from 'react';
import { PDFDocument } from 'pdf-lib';

export const usePdfReorganize = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Parsea un string de orden de páginas como "4, 1, 3, 2"
   * y devuelve un array 0-indexed: [3, 0, 2, 1]
   */
  const parseOrder = (orderStr: string, totalPages: number): number[] => {
    const parts = orderStr.split(',').map((p) => p.trim());
    const result: number[] = [];

    for (const part of parts) {
      const num = parseInt(part, 10);
      if (isNaN(num) || num < 1 || num > totalPages) {
        throw new Error(
          `Número de página inválido: "${part}". El documento tiene ${totalPages} páginas.`
        );
      }
      result.push(num - 1); // Convertir a 0-indexed
    }

    return result;
  };

  const reorganizePdf = async (file: File, orderStr: string): Promise<Blob | null> => {
    setIsProcessing(true);
    setError(null);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const originalPdf = await PDFDocument.load(arrayBuffer);
      const totalPages = originalPdf.getPageCount();

      const pageOrder = parseOrder(orderStr, totalPages);

      const newPdf = await PDFDocument.create();
      const copiedPages = await newPdf.copyPages(originalPdf, pageOrder);
      copiedPages.forEach((page) => newPdf.addPage(page));

      const newPdfBytes = await newPdf.save();
      return new Blob([newPdfBytes], { type: 'application/pdf' });
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error al reorganizar el PDF.');
      return null;
    } finally {
      setIsProcessing(false);
    }
  };

  return { reorganizePdf, isProcessing, error };
};
