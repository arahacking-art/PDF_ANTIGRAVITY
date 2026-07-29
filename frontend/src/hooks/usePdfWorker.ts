/**
 * usePdfWorker.ts
 * React hook to use the pdfLibWorker Web Worker.
 * Exposes async functions for heavy PDF operations that run off the main thread.
 */
import { useRef, useCallback, useEffect } from 'react';

type WorkerRequest =
  | { id: string; type: 'ROTATE_PAGE'; payload: { buffer: ArrayBuffer; pageIndex: number; angle: number } }
  | { id: string; type: 'DELETE_PAGE'; payload: { buffer: ArrayBuffer; pageIndex: number } }
  | { id: string; type: 'MERGE'; payload: { buffers: ArrayBuffer[] } }
  | { id: string; type: 'SPLIT'; payload: { buffer: ArrayBuffer; ranges: Array<{ start: number; end: number }> } };

type WorkerResponse =
  | { id: string; type: 'SUCCESS'; buffer: ArrayBuffer }
  | { id: string; type: 'SUCCESS_MULTI'; buffers: ArrayBuffer[] }
  | { id: string; type: 'ERROR'; error: string };

type PendingResolver = {
  resolve: (value: ArrayBuffer | ArrayBuffer[]) => void;
  reject: (reason: Error) => void;
};

let idCounter = 0;
function genId() { return `pdf-worker-${++idCounter}-${Date.now()}`; }

export function usePdfWorker() {
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef<Map<string, PendingResolver>>(new Map());

  useEffect(() => {
    // Create worker on mount
    workerRef.current = new Worker(
      new URL('../workers/pdfLibWorker.ts', import.meta.url),
      { type: 'module' }
    );

    workerRef.current.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const { id, type } = event.data;
      const pending = pendingRef.current.get(id);
      if (!pending) return;

      pendingRef.current.delete(id);

      if (type === 'ERROR') {
        pending.reject(new Error((event.data as { id: string; type: 'ERROR'; error: string }).error));
      } else if (type === 'SUCCESS') {
        pending.resolve((event.data as { id: string; type: 'SUCCESS'; buffer: ArrayBuffer }).buffer);
      } else if (type === 'SUCCESS_MULTI') {
        pending.resolve((event.data as { id: string; type: 'SUCCESS_MULTI'; buffers: ArrayBuffer[] }).buffers);
      }
    };

    workerRef.current.onerror = (error) => {
      console.error('PDF Worker error:', error);
      // Reject all pending operations
      pendingRef.current.forEach(({ reject }) => reject(new Error('Worker crashed')));
      pendingRef.current.clear();
    };

    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  /**
   * Sends a message to the worker and returns a Promise resolving to the result.
   */
  const sendToWorker = useCallback(<T extends ArrayBuffer | ArrayBuffer[]>(
    request: Omit<WorkerRequest, 'id'>,
    transferable?: Transferable[]
  ): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error('PDF Worker not available'));
        return;
      }

      const id = genId();
      pendingRef.current.set(id, {
        resolve: resolve as (value: ArrayBuffer | ArrayBuffer[]) => void,
        reject,
      });

      const message = { ...request, id } as WorkerRequest;
      if (transferable && transferable.length > 0) {
        workerRef.current.postMessage(message, transferable);
      } else {
        workerRef.current.postMessage(message);
      }
    });
  }, []);

  const rotatePage = useCallback(async (
    arrayBuffer: ArrayBuffer,
    pageIndex: number,
    angle = 90
  ): Promise<ArrayBuffer> => {
    // Clone buffer before transfer so we don't corrupt the original
    const clone = arrayBuffer.slice(0);
    return sendToWorker<ArrayBuffer>(
      { type: 'ROTATE_PAGE', payload: { buffer: clone, pageIndex, angle } },
      [clone]
    );
  }, [sendToWorker]);

  const deletePage = useCallback(async (
    arrayBuffer: ArrayBuffer,
    pageIndex: number
  ): Promise<ArrayBuffer> => {
    const clone = arrayBuffer.slice(0);
    return sendToWorker<ArrayBuffer>(
      { type: 'DELETE_PAGE', payload: { buffer: clone, pageIndex } },
      [clone]
    );
  }, [sendToWorker]);

  const mergeDocuments = useCallback(async (
    arrayBuffers: ArrayBuffer[]
  ): Promise<ArrayBuffer> => {
    const clones = arrayBuffers.map(b => b.slice(0));
    return sendToWorker<ArrayBuffer>(
      { type: 'MERGE', payload: { buffers: clones } },
      clones
    );
  }, [sendToWorker]);

  const splitDocument = useCallback(async (
    arrayBuffer: ArrayBuffer,
    ranges: Array<{ start: number; end: number }>
  ): Promise<ArrayBuffer[]> => {
    const clone = arrayBuffer.slice(0);
    return sendToWorker<ArrayBuffer[]>(
      { type: 'SPLIT', payload: { buffer: clone, ranges } },
      [clone]
    );
  }, [sendToWorker]);

  return { rotatePage, deletePage, mergeDocuments, splitDocument };
}
