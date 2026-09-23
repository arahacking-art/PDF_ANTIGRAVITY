/**
 * pdfLibWorker.ts
 * Web Worker for heavy pdf-lib operations.
 * Runs off the main thread to prevent UI freezing.
 */
import { PDFDocument, degrees } from 'pdf-lib';

type WorkerRequest =
  | { id: string; type: 'ROTATE_PAGE'; payload: { buffer: ArrayBuffer; pageIndex: number; angle: number } }
  | { id: string; type: 'DELETE_PAGE'; payload: { buffer: ArrayBuffer; pageIndex: number } }
  | { id: string; type: 'MERGE'; payload: { buffers: ArrayBuffer[] } }
  | { id: string; type: 'SPLIT'; payload: { buffer: ArrayBuffer; ranges: Array<{ start: number; end: number }> } };

type WorkerResponse =
  | { id: string; type: 'SUCCESS'; buffer: ArrayBuffer }
  | { id: string; type: 'SUCCESS_MULTI'; buffers: ArrayBuffer[] }
  | { id: string; type: 'ERROR'; error: string };

// Fix TS2769: TypeScript 6 requires explicit StructuredSerializeOptions for transfer
// Use postMessage(data, { transfer: [...] }) instead of postMessage(data, [...])
self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, type, payload } = event.data;

  try {
    switch (type) {
      case 'ROTATE_PAGE': {
        const { buffer, pageIndex, angle } = payload as { buffer: ArrayBuffer; pageIndex: number; angle: number };
        const pdfDoc = await PDFDocument.load(buffer);
        const page = pdfDoc.getPage(pageIndex);
        page.setRotation(degrees(page.getRotation().angle + angle));
        const result = await pdfDoc.save();
        const response: WorkerResponse = { id, type: 'SUCCESS', buffer: result.buffer as ArrayBuffer };
        self.postMessage(response, { transfer: [result.buffer as ArrayBuffer] });
        break;
      }

      case 'DELETE_PAGE': {
        const { buffer, pageIndex } = payload as { buffer: ArrayBuffer; pageIndex: number };
        const pdfDoc = await PDFDocument.load(buffer);
        pdfDoc.removePage(pageIndex);
        const result = await pdfDoc.save();
        const response: WorkerResponse = { id, type: 'SUCCESS', buffer: result.buffer as ArrayBuffer };
        self.postMessage(response, { transfer: [result.buffer as ArrayBuffer] });
        break;
      }

      case 'MERGE': {
        const { buffers } = payload as { buffers: ArrayBuffer[] };
        const mergedDoc = await PDFDocument.create();
        for (const buf of buffers) {
          const doc = await PDFDocument.load(buf);
          const pages = await mergedDoc.copyPages(doc, doc.getPageIndices());
          pages.forEach(p => mergedDoc.addPage(p));
        }
        const result = await mergedDoc.save();
        const response: WorkerResponse = { id, type: 'SUCCESS', buffer: result.buffer as ArrayBuffer };
        self.postMessage(response, { transfer: [result.buffer as ArrayBuffer] });
        break;
      }

      case 'SPLIT': {
        const { buffer, ranges } = payload as { buffer: ArrayBuffer; ranges: Array<{ start: number; end: number }> };
        const sourceDoc = await PDFDocument.load(buffer);
        const resultBuffers: ArrayBuffer[] = [];

        for (const range of ranges) {
          const newDoc = await PDFDocument.create();
          const pageIndices = Array.from(
            { length: range.end - range.start + 1 },
            (_, i) => range.start + i
          );
          const pages = await newDoc.copyPages(sourceDoc, pageIndices);
          pages.forEach(p => newDoc.addPage(p));
          const bytes = await newDoc.save();
          resultBuffers.push(bytes.buffer as ArrayBuffer);
        }

        const response: WorkerResponse = { id, type: 'SUCCESS_MULTI', buffers: resultBuffers };
        self.postMessage(response, { transfer: resultBuffers });
        break;
      }
    }
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error in PDF worker';
    const response: WorkerResponse = { id, type: 'ERROR', error: errorMsg };
    self.postMessage(response);
  }
};
