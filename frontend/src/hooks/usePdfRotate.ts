import { useState } from 'react';
import { PDFDocument, degrees } from 'pdf-lib';

type RotationAngle = 90 | 180 | 270;

export const usePdfRotate = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rotatePdf = async (
    file: File,
    angle: RotationAngle,
    pageScope: 'all' | number[]
  ): Promise<Blob | null> => {
    setIsProcessing(true);
    setError(null);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await PDFDocument.load(arrayBuffer);
      const pages = pdf.getPages();

      const targetPages = pageScope === 'all'
        ? pages
        : pages.filter((_, i) => (pageScope as number[]).includes(i + 1));

      targetPages.forEach((page) => {
        const currentRotation = page.getRotation().angle;
        page.setRotation(degrees((currentRotation + angle) % 360));
      });

      const bytes = await pdf.save();
      return new Blob([bytes], { type: 'application/pdf' });
    } catch (err: any) {
      setError(err.message || 'Error al rotar el PDF.');
      return null;
    } finally {
      setIsProcessing(false);
    }
  };

  return { rotatePdf, isProcessing, error };
};
