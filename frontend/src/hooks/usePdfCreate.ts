import { useState } from 'react';
import { PDFDocument, StandardFonts, rgb, PageSizes } from 'pdf-lib';

export type BlockType = 'text' | 'image';

export interface TextBlock {
  id: string;
  type: 'text';
  title: string;
  content: string;
  fontSize: number;
}

export interface ImageBlock {
  id: string;
  type: 'image';
  title: string;
  file: File;
  dataUrl: string;
}

export type PdfBlock = TextBlock | ImageBlock;

export const usePdfCreate = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createPdf = async (blocks: PdfBlock[]): Promise<Blob | null> => {
    setIsProcessing(true);
    setError(null);
    try {
      if (blocks.length === 0) throw new Error('Agrega al menos un bloque de contenido.');

      const pdf = await PDFDocument.create();
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);

      for (const block of blocks) {
        const page = pdf.addPage(PageSizes.A4);
        const { width, height } = page.getSize();
        const MARGIN = 50;

        if (block.type === 'text') {
          // Draw title
          page.drawText(block.title, {
            x: MARGIN, y: height - MARGIN - 20,
            size: 16, font: boldFont, color: rgb(0.1, 0.1, 0.5),
          });

          // Word-wrap content
          const words = block.content.split(' ');
          const lines: string[] = [];
          let currentLine = '';
          const maxWidth = width - MARGIN * 2;

          for (const word of words) {
            const testLine = currentLine ? `${currentLine} ${word}` : word;
            const lineWidth = font.widthOfTextAtSize(testLine, block.fontSize);
            if (lineWidth > maxWidth && currentLine) {
              lines.push(currentLine);
              currentLine = word;
            } else {
              currentLine = testLine;
            }
          }
          if (currentLine) lines.push(currentLine);

          // Handle newlines in original content
          const finalLines: string[] = [];
          for (const line of lines) {
            finalLines.push(...line.split('\n'));
          }

          let y = height - MARGIN - 55;
          for (const line of finalLines) {
            if (y < MARGIN) break;
            page.drawText(line, { x: MARGIN, y, size: block.fontSize, font, color: rgb(0, 0, 0) });
            y -= block.fontSize + 4;
          }

        } else if (block.type === 'image') {
          const arrayBuffer = await block.file.arrayBuffer();
          const mimeType = block.file.type;
          let embeddedImage;
          if (mimeType === 'image/png') {
            embeddedImage = await pdf.embedPng(arrayBuffer);
          } else {
            embeddedImage = await pdf.embedJpg(arrayBuffer);
          }

          // Draw title
          page.drawText(block.title, {
            x: MARGIN, y: height - MARGIN - 20,
            size: 16, font: boldFont, color: rgb(0.1, 0.1, 0.5),
          });

          // Scale image to fit page
          const maxW = width - MARGIN * 2;
          const maxH = height - MARGIN * 2 - 60;
          const scaleW = maxW / embeddedImage.width;
          const scaleH = maxH / embeddedImage.height;
          const scale = Math.min(scaleW, scaleH, 1);
          const imgW = embeddedImage.width * scale;
          const imgH = embeddedImage.height * scale;

          page.drawImage(embeddedImage, {
            x: (width - imgW) / 2,
            y: (height - imgH) / 2 - 20,
            width: imgW,
            height: imgH,
          });
        }
      }

      const bytes = await pdf.save();
      return new Blob([bytes], { type: 'application/pdf' });
    } catch (err: any) {
      setError(err.message || 'Error al crear el PDF.');
      return null;
    } finally {
      setIsProcessing(false);
    }
  };

  return { createPdf, isProcessing, error };
};
