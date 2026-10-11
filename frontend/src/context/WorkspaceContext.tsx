import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';

export type OverlayRenderer = (pageIndex: number, dims: { width: number; height: number }) => ReactNode;

interface WorkspaceContextType {
  overlayRenderer: OverlayRenderer | null;
  /**
   * Almacena un renderer de overlay en el contexto.
   * NOTA INTERNA: usa `_setOverlayRenderer(() => renderer)` para evitar
   * que React trate la función como un "updater" de useState.
   */
  setOverlayRenderer: (renderer: OverlayRenderer | null) => void;
  /** Cierra la herramienta activa (p. ej. tras aplicar su resultado al documento) */
  closeTool: () => void;
  /** Lo usa App para indicar cómo se cierra la herramienta activa */
  registerCloseTool: (handler: (() => void) | null) => void;
  /** Abre "Unir PDFs" con estos archivos ya cargados (p. ej. al soltar varios en el inicio) */
  startMerge: (files: File[]) => void;
  /** Devuelve (y vacía) los archivos pendientes de unir; lo usa MergeTool al montarse */
  takeMergeFiles: () => File[];
  /** Lo usa App para indicar cómo se abre la herramienta de unir */
  registerOpenMerge: (handler: (() => void) | null) => void;
}

const WorkspaceContext = createContext<WorkspaceContextType | null>(null);

export const WorkspaceProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [overlayRenderer, _setOverlayRenderer] = useState<OverlayRenderer | null>(null);

  /**
   * Wrapper seguro: siempre envuelve el renderer en una factory (() => renderer)
   * para que React no lo trate como función updater de useState y almacene
   * el resultado (JSX) en lugar de la función misma.
   */
  const setOverlayRenderer = useCallback((renderer: OverlayRenderer | null) => {
    _setOverlayRenderer(() => renderer);
  }, []);

  const closeToolRef = useRef<(() => void) | null>(null);
  const closeTool = useCallback(() => closeToolRef.current?.(), []);
  const registerCloseTool = useCallback((handler: (() => void) | null) => {
    closeToolRef.current = handler;
  }, []);

  const openMergeRef = useRef<(() => void) | null>(null);
  const mergeFilesRef = useRef<File[]>([]);
  const registerOpenMerge = useCallback((handler: (() => void) | null) => {
    openMergeRef.current = handler;
  }, []);
  const startMerge = useCallback((files: File[]) => {
    mergeFilesRef.current = files;
    openMergeRef.current?.();
  }, []);
  const takeMergeFiles = useCallback(() => {
    const files = mergeFilesRef.current;
    mergeFilesRef.current = [];
    return files;
  }, []);

  return (
    <WorkspaceContext.Provider value={{
      overlayRenderer, setOverlayRenderer, closeTool, registerCloseTool,
      startMerge, takeMergeFiles, registerOpenMerge,
    }}>
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
};
