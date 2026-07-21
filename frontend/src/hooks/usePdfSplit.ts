import { useState } from 'react';
import { PDFDocument } from 'pdf-lib';

export const usePdfSplit = () => {
  const [isSplitting, setIsSplitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parseRanges = (rangesStr: string, maxPages: number): number[] => {
    const pages = new Set<number>();
    const parts = rangesStr.split(',').map(p => p.trim());
    
    for (const part of parts) {
      if (part.includes('-')) {
        const [startStr, endStr] = part.split('-');
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);
        if (isNaN(start) || isNaN(end) || start > end || start < 1 || end > maxPages) {
          throw new Error(`Rango inválido: ${part}`);
        }
        for (let i = start; i <= end; i++) {
          pages.add(i - 1); // 0-indexed for pdf-lib
        }
      } else {
        const page = parseInt(part, 10);
        if (isNaN(page) || page < 1 || page > maxPages) {
          throw new Error(`Página inválida: ${part}`);
        }
        pages.add(page - 1);
      }
    }
    
    // Sort pages
    return Array.from(pages).sort((a, b) => a - b);
  };

  const splitPdf = async (file: File, ranges: string): Promise<Blob | null> => {
    setIsSplitting(true);
    setError(null);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const originalPdf = await PDFDocument.load(arrayBuffer);
      const totalPages = originalPdf.getPageCount();
      
      const pagesToExtract = parseRanges(ranges, totalPages);
      
      if (pagesToExtract.length === 0) {
        throw new Error('No se especificaron páginas válidas para extraer.');
      }

      const newPdf = await PDFDocument.create();
      const copiedPages = await newPdf.copyPages(originalPdf, pagesToExtract);
      copiedPages.forEach((page) => newPdf.addPage(page));

      const newPdfBytes = await newPdf.save();
      return new Blob([newPdfBytes as unknown as BlobPart], { type: 'application/pdf' });
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error al procesar el PDF.');
      return null;
    } finally {
      setIsSplitting(false);
    }
  };

  return { splitPdf, isSplitting, error };
};
