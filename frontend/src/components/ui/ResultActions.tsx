import React, { useState } from 'react';
import { CheckCircle, Download, FileCheck2, Loader } from 'lucide-react';
import Button from './Button';
import { useWorkspace } from '../../context/WorkspaceContext';

interface ResultActionsProps {
  /** Mensaje principal, p. ej. "¡Comprimido correctamente!" */
  title: React.ReactNode;
  /** Detalle opcional bajo el título */
  subtitle?: React.ReactNode;
  /** Descarga el resultado como archivo independiente */
  onDownload: () => void;
  /**
   * Aplica el resultado al documento abierto. Si se omite, solo se ofrece la descarga
   * (p. ej. cuando el archivo de entrada no es el documento abierto).
   * Si devuelve `false`, la herramienta no se cierra (p. ej. el usuario canceló).
   */
  onApply?: () => Promise<void | false> | void | false;
  /** Texto del botón principal */
  applyLabel?: string;
  /** Texto de ayuda bajo los botones */
  applyHint?: string;
}

/**
 * Bloque común que muestran las herramientas al terminar:
 * "Aplicar al documento" (acción principal, se puede deshacer) o "Descargar".
 * Tras aplicar se cierra la herramienta para que el usuario vea el documento actualizado.
 */
const ResultActions: React.FC<ResultActionsProps> = ({
  title, subtitle, onDownload, onApply, applyLabel = 'Aplicar al documento',
  applyHint = 'Al aplicar, el cambio queda en el documento abierto y puedes seguir editando. Se deshace con Ctrl+Z.',
}) => {
  const { closeTool } = useWorkspace();
  const [isApplying, setIsApplying] = useState(false);

  const handleApply = async () => {
    if (!onApply) return;
    setIsApplying(true);
    try {
      if ((await onApply()) !== false) closeTool();
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
      <div className="flex items-start gap-2">
        <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-green-800 font-semibold">{title}</p>
          {subtitle && <p className="text-xs text-green-700 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {onApply && (
          <Button size="sm" onClick={handleApply} disabled={isApplying} className="gap-1.5">
            {isApplying ? <Loader className="w-4 h-4 animate-spin" /> : <FileCheck2 className="w-4 h-4" />}
            {applyLabel}
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={onDownload} disabled={isApplying} className="gap-1.5">
          <Download className="w-4 h-4" />
          Descargar
        </Button>
      </div>
      {onApply && (
        <p className="text-[11px] text-green-700">{applyHint}</p>
      )}
    </div>
  );
};

export default ResultActions;
