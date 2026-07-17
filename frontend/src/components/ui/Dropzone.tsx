import React, { useCallback } from 'react';
import { useDropzone, type DropzoneOptions } from 'react-dropzone';
import { UploadCloud } from 'lucide-react';
import { cn } from './Button'; // Reusing cn utility

interface DropzoneProps extends Omit<DropzoneOptions, 'onDrop'> {
  onFilesSelected: (files: File[]) => void;
  className?: string;
}

const Dropzone: React.FC<DropzoneProps> = ({ onFilesSelected, className, ...props }) => {
  const onDrop = useCallback((acceptedFiles: File[]) => {
    onFilesSelected(acceptedFiles);
  }, [onFilesSelected]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    ...props
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        "border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-colors duration-200",
        isDragActive
          ? "border-blue-500 bg-blue-50"
          : "border-gray-300 hover:border-blue-400 hover:bg-blue-50/30 bg-white",
        className
      )}
    >
      <input {...getInputProps()} />
      <UploadCloud className={cn(
        "w-12 h-12 mb-4",
        isDragActive ? "text-blue-500" : "text-gray-400"
      )} />
      <p className="text-base font-semibold text-gray-700">
        {isDragActive
          ? "Suelta los archivos aquí..."
          : "Arrastra y suelta tus archivos aquí"}
      </p>
      <p className="text-sm text-gray-400 mt-2">
        o haz clic para seleccionar los archivos
      </p>
    </div>
  );
};

export default Dropzone;
