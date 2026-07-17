import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, FileText, Scissors, ShieldCheck, Minimize2 } from 'lucide-react';
import { usePdfContext } from '../../context/PdfContext';

/**
 * Welcome screen shown when no PDF is loaded.
 * Large central dropzone with feature highlights.
 */
const WelcomeDropzone: React.FC = () => {
  const { loadFile } = usePdfContext();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles[0]) loadFile(acceptedFiles[0]);
  }, [loadFile]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    multiple: false,
  });

  const features = [
    { Icon: Scissors, label: 'Dividir y Reorganizar', desc: 'Extrae o reordena las páginas directamente' },
    { Icon: ShieldCheck, label: 'Proteger y Encriptar', desc: 'Añade contraseña AES-256 a tus documentos' },
    { Icon: Minimize2, label: 'Comprimir', desc: 'Reduce el tamaño sin perder calidad' },
    { Icon: FileText, label: 'Convertir', desc: 'Exporta a Word, Excel, PowerPoint o JPG' },
  ];

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-2xl w-full space-y-8">
        {/* Dropzone */}
        <div
          {...getRootProps()}
          className={[
            'border-2 border-dashed rounded-2xl p-16 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200',
            isDragActive
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 scale-[1.02] shadow-xl'
              : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50/30 dark:hover:bg-blue-900/20 hover:shadow-lg',
          ].join(' ')}
        >
          <input {...getInputProps()} />
          <UploadCloud className={`w-16 h-16 mb-5 transition-colors ${isDragActive ? 'text-blue-500' : 'text-gray-300'}`} />
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">
            {isDragActive ? 'Suelta tu PDF aquí...' : 'Abre un documento PDF'}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Arrastra y suelta un archivo aquí, o haz clic para seleccionarlo
          </p>
          <p className="text-xs text-gray-300 mt-3">
            Tu archivo se procesa localmente. No se sube a ningún servidor externo.
          </p>
        </div>

        {/* Feature highlights */}
        <div className="grid grid-cols-2 gap-3">
          {features.map(({ Icon, label, desc }) => (
            <div key={label} className="flex items-start gap-3 p-3 rounded-xl bg-white/60 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700">
              <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg flex-shrink-0">
                <Icon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="text-left">
                <h3 className="text-xs font-semibold text-gray-800 dark:text-gray-200">{label}</h3>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default WelcomeDropzone;
