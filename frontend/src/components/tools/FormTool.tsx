import React, { useState, useEffect } from 'react';
import { usePdfContext } from '../../context/PdfContext';
import Dropzone from '../ui/Dropzone';
import Button from '../ui/Button';
import { FileEdit, FileText, CheckCircle } from 'lucide-react';
import { PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown } from 'pdf-lib';

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
};

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
};

interface FormFieldInfo {
  name: string;
  type: 'text' | 'checkbox' | 'dropdown' | 'unknown';
  options: string[];
}

const FormTool: React.FC = () => {
  const ctx = usePdfContext();
  const workspaceFile = ctx.file;

  const [localFile, setLocalFile] = useState<File | null>(null);
  const [fields, setFields] = useState<FormFieldInfo[]>([]);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [isLoadingFields, setIsLoadingFields] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  const effectiveFile = workspaceFile || localFile;

  useEffect(() => {
    const loadFields = async () => {
      if (!effectiveFile) {
        setFields([]);
        setValues({});
        return;
      }

      setIsLoadingFields(true);
      setError(null);

      try {
        let buffer: ArrayBuffer;
        if (workspaceFile && ctx.arrayBuffer) {
          buffer = ctx.arrayBuffer;
        } else {
          buffer = await effectiveFile.arrayBuffer();
        }

        const pdfDoc = await PDFDocument.load(buffer);
        const form = pdfDoc.getForm();
        const pdfFields = form.getFields();

        const parsedFields: FormFieldInfo[] = [];
        const initialValues: Record<string, string | boolean> = {};

        for (const f of pdfFields) {
          const name = f.getName();
          let type: FormFieldInfo['type'] = 'unknown';
          let options: string[] = [];

          if (f instanceof PDFTextField) {
            type = 'text';
            initialValues[name] = f.getText() || '';
          } else if (f instanceof PDFCheckBox) {
            type = 'checkbox';
            initialValues[name] = f.isChecked();
          } else if (f instanceof PDFDropdown) {
            type = 'dropdown';
            options = f.getOptions() || [];
            const selected = f.getSelected();
            initialValues[name] = selected.length > 0 ? selected[0] : '';
          }

          if (type !== 'unknown') {
            parsedFields.push({ name, type, options });
          }
        }

        setFields(parsedFields);
        setValues(initialValues);
      } catch (err: any) {
        setError(err.message || 'Error al cargar los campos del formulario. Es posible que el PDF no tenga un formulario o esté protegido.');
        setFields([]);
      } finally {
        setIsLoadingFields(false);
      }
    };

    loadFields();
  }, [effectiveFile, workspaceFile, ctx.arrayBuffer]);

  const handleFill = async () => {
    if (!effectiveFile) return;
    setIsProcessing(true);
    setError(null);
    setResultBlob(null);

    try {
      let buffer: ArrayBuffer;
      if (workspaceFile && ctx.arrayBuffer) {
        buffer = ctx.arrayBuffer;
      } else {
        buffer = await effectiveFile.arrayBuffer();
      }

      const pdfDoc = await PDFDocument.load(buffer);
      const form = pdfDoc.getForm();

      for (const fieldInfo of fields) {
        const val = values[fieldInfo.name];
        if (val === undefined) continue;

        if (fieldInfo.type === 'text') {
          const field = form.getTextField(fieldInfo.name);
          field.setText((val as string) || '');
        } else if (fieldInfo.type === 'checkbox') {
          const field = form.getCheckBox(fieldInfo.name);
          if (val) field.check();
          else field.uncheck();
        } else if (fieldInfo.type === 'dropdown') {
          const field = form.getDropdown(fieldInfo.name);
          if (val) field.select(val as string);
        }
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      setResultBlob(blob);
    } catch (err: any) {
      setError(err.message || 'Error al procesar el PDF');
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadResult = () => {
    if (!resultBlob || !effectiveFile) return;
    downloadBlob(resultBlob, `rellenado_${effectiveFile.name}`);
  };

  const handleClear = () => {
    setLocalFile(null);
    setResultBlob(null);
    setFields([]);
    setValues({});
  };

  const handleValueChange = (name: string, val: string | boolean) => {
    setValues(prev => ({ ...prev, [name]: val }));
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-5">
      <div className="flex items-center gap-3 pb-2 border-b border-gray-200">
        <div className="p-2 bg-blue-50 rounded-lg"><FileEdit className="w-5 h-5 text-blue-600" /></div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Rellenar Formulario PDF</h1>
          <p className="text-sm text-gray-500">Rellena campos de formularios (AcroForms) interactivamente. Procesado localmente.</p>
        </div>
      </div>

      {workspaceFile ? (
        <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <FileText className="w-5 h-5 text-blue-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-blue-900 truncate">{workspaceFile.name}</p>
            <p className="text-xs text-blue-600">{formatBytes(workspaceFile.size)} · Desde Workspace</p>
          </div>
        </div>
      ) : !localFile ? (
        <Dropzone onFilesSelected={(f) => f[0] && setLocalFile(f[0])} accept={{ 'application/pdf': ['.pdf'] }} multiple={false} />
      ) : null}

      {effectiveFile && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
          {!workspaceFile && localFile && (
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <span className="font-medium text-gray-800 truncate flex-1">{localFile.name}</span>
              <button onClick={handleClear} className="text-red-500 hover:text-red-700 text-sm ml-4 transition-colors">Cambiar</button>
            </div>
          )}

          {isLoadingFields ? (
            <div className="p-4 text-center text-gray-500 bg-gray-50 rounded-lg">Cargando campos del formulario...</div>
          ) : fields.length === 0 ? (
            <div className="p-4 text-center text-gray-500 bg-gray-50 rounded-lg">No se encontraron campos de formulario compatibles en este PDF.</div>
          ) : (
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
              <h2 className="font-semibold text-gray-800">Campos del Formulario</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {fields.map(field => (
                  <div key={field.name} className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700">{field.name}</label>
                    {field.type === 'text' && (
                      <input
                        type="text"
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-shadow"
                        value={values[field.name] as string || ''}
                        onChange={e => handleValueChange(field.name, e.target.value)}
                      />
                    )}
                    {field.type === 'checkbox' && (
                      <div className="flex items-center gap-2 mt-2">
                        <input
                          type="checkbox"
                          className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 border-gray-300"
                          checked={!!values[field.name]}
                          onChange={e => handleValueChange(field.name, e.target.checked)}
                        />
                        <span className="text-sm text-gray-600">Marcar / Desmarcar</span>
                      </div>
                    )}
                    {field.type === 'dropdown' && (
                      <select
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-shadow bg-white"
                        value={values[field.name] as string || ''}
                        onChange={e => handleValueChange(field.name, e.target.value)}
                      >
                        <option value="">Seleccione una opción...</option>
                        {field.options.map(opt => (
                           <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && <div className="p-4 text-sm text-red-700 bg-red-100 rounded-lg">{error}</div>}

          {resultBlob && (
            <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
              <p className="text-sm text-green-800 font-medium flex-1">¡Procesado correctamente!</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={downloadResult}>Descargar</Button>
                {workspaceFile && (
                  <Button size="sm" onClick={async () => {
                    await ctx.replaceWithBlob(resultBlob, `rellenado_${effectiveFile.name}`);
                    setResultBlob(null);
                  }}>Reemplazar en Workspace</Button>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            {!workspaceFile && (
              <Button variant="outline" onClick={handleClear} disabled={isProcessing}>Cancelar</Button>
            )}
            <Button onClick={handleFill} disabled={isProcessing || fields.length === 0 || isLoadingFields}>
              {isProcessing ? 'Procesando...' : 'Rellenar PDF'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default FormTool;
