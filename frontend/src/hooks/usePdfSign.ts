import { useState } from 'react';
import { PDFDocument } from 'pdf-lib';

export const usePdfSign = () => {
  const [isSigning, setIsSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signPdf = async (
    pdfFile: File,
    signatureImageFile: File,
    targetPage: 'last' | 'first' | number
  ): Promise<Blob | null> => {
    setIsSigning(true);
    setError(null);
    try {
      const [pdfBytes, imageBytes] = await Promise.all([
        pdfFile.arrayBuffer(),
        signatureImageFile.arrayBuffer(),
      ]);

      const pdf = await PDFDocument.load(pdfBytes);
      const pages = pdf.getPages();
      const totalPages = pages.length;

      // Determinar la página destino (0-indexed)
      let pageIndex: number;
      if (targetPage === 'last') {
        pageIndex = totalPages - 1;
      } else if (targetPage === 'first') {
        pageIndex = 0;
      } else {
        pageIndex = Math.max(0, Math.min(targetPage - 1, totalPages - 1));
      }

      const page = pages[pageIndex];
      const { width, height: _height } = page.getSize();

      // Incrustar imagen (soporta JPG y PNG)
      const mimeType = signatureImageFile.type;
      let embeddedImage;
      if (mimeType === 'image/png') {
        embeddedImage = await pdf.embedPng(imageBytes);
      } else if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
        embeddedImage = await pdf.embedJpg(imageBytes);
      } else {
        throw new Error('Formato de imagen no soportado. Usa PNG o JPG.');
      }

      // Escalar la firma: máx 200px de ancho, manteniendo aspecto
      const MAX_WIDTH = 200;
      const imgWidth = embeddedImage.width;
      const imgHeight = embeddedImage.height;
      const scale = Math.min(MAX_WIDTH / imgWidth, 1);
      const finalWidth = imgWidth * scale;
      const finalHeight = imgHeight * scale;

      // Posicionar en esquina inferior derecha con margen de 30px
      const MARGIN = 30;
      const x = width - finalWidth - MARGIN;
      const y = MARGIN;

      page.drawImage(embeddedImage, {
        x,
        y,
        width: finalWidth,
        height: finalHeight,
        opacity: 0.95,
      });

      const signedBytes = await pdf.save();
      return new Blob([signedBytes as unknown as BlobPart], { type: 'application/pdf' });
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error al firmar el PDF.');
      return null;
    } finally {
      setIsSigning(false);
    }
  };

  return { signPdf, isSigning, error };
};
