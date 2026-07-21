import { useState } from 'react';
import { PDFDocument } from 'pdf-lib';

export const usePdfMerge = () => {
  const [isMerging, setIsMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mergePdfs = async (files: File[]): Promise<Blob | null> => {
    setIsMerging(true);
    setError(null);
    try {
      const mergedPdf = await PDFDocument.create();

      for (const file of files) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await PDFDocument.load(arrayBuffer);
        const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
      }

      const mergedPdfBytes = await mergedPdf.save();
      return new Blob([mergedPdfBytes as unknown as BlobPart], { type: 'application/pdf' });
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error al procesar los PDFs.');
      return null;
    } finally {
      setIsMerging(false);
    }
  };

  return { mergePdfs, isMerging, error };
};
