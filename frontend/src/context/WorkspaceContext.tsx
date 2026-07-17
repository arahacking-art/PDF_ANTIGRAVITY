import React, { createContext, useContext, useState, ReactNode } from 'react';

export type OverlayRenderer = (pageIndex: number, dims: { width: number; height: number }) => ReactNode;

interface WorkspaceContextType {
  overlayRenderer: OverlayRenderer | null;
  setOverlayRenderer: (renderer: OverlayRenderer | null) => void;
}

const WorkspaceContext = createContext<WorkspaceContextType | null>(null);

export const WorkspaceProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [overlayRenderer, setOverlayRenderer] = useState<OverlayRenderer | null>(null);

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
