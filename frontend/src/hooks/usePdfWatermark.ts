import { useState } from 'react';
import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib';

export interface WatermarkOptions {
  text: string;
  opacity: number;      // 0–1
  fontSize: number;
  rotation: number;     // degrees
  color: 'gray' | 'red' | 'blue';
  position: 'center' | 'tiled';
}

const COLOR_MAP = {
  gray: rgb(0.5, 0.5, 0.5),
  red:  rgb(0.8, 0.1, 0.1),
  blue: rgb(0.1, 0.2, 0.8),
};

export const usePdfWatermark = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addWatermark = async (file: File, opts: WatermarkOptions): Promise<Blob | null> => {
    setIsProcessing(true);
    setError(null);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await PDFDocument.load(arrayBuffer);
      const font = await pdf.embedFont(StandardFonts.HelveticaBold);
      const color = COLOR_MAP[opts.color];

      for (const page of pdf.getPages()) {
        const { width, height } = page.getSize();
        const textWidth = font.widthOfTextAtSize(opts.text, opts.fontSize);

        if (opts.position === 'center') {
          page.drawText(opts.text, {
            x: (width - textWidth) / 2,
            y: height / 2,
            size: opts.fontSize,
            font,
            color,
            opacity: opts.opacity,
            rotate: degrees(opts.rotation),
          });
        } else {
          // Tiled: repeat across the page
          const stepX = textWidth + 60;
          const stepY = opts.fontSize + 60;
          for (let y = 0; y < height + stepY; y += stepY) {
            for (let x = -stepX; x < width + stepX; x += stepX) {
              page.drawText(opts.text, {
                x,
                y,
                size: opts.fontSize,
                font,
                color,
                opacity: opts.opacity,
                rotate: degrees(opts.rotation),
              });
            }
          }
        }
      }

      const bytes = await pdf.save();
      return new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
    } catch (err: any) {
      setError(err.message || 'Error al añadir la marca de agua.');
      return null;
    } finally {
      setIsProcessing(false);
    }
  };

  return { addWatermark, isProcessing, error };
};
