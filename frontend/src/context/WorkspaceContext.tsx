import React, { createContext, useContext, useState, useCallback } from 'react';
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

  return (
    <WorkspaceContext.Provider value={{ overlayRenderer, setOverlayRenderer }}>
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
