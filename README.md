# PDF Antigravity Suite

Una plataforma web avanzada y moderna para la manipulación integral de archivos PDF, diseñada con un paradigma de "Documento Central" inspirado en editores de grado profesional como Adobe Acrobat. Ofrece un lienzo interactivo, ejecución ultrarrápida del lado del cliente, y procesamiento pesado delegable al backend.

---

## 🛠️ Tecnologías y Framework

El proyecto está dividido en una arquitectura cliente-servidor (Frontend / Backend), orquestada mediante Docker.

### Frontend (Librerías Clave)
- **`react` / `react-dom` (v19)**: Motor central de la interfaz de usuario.
- **`vite`**: Herramienta de empaquetado y servidor de desarrollo (HMR ultrarrápido).
- **`tailwindcss` (v3)**: Framework de estilos por utilidad, utilizado para diseñar toda la interfaz, incluyendo el sistema nativo de Modo Oscuro.
- **`pdfjs-dist` (Mozilla)**: Motor de renderizado de PDFs. Se utiliza exclusivamente para rasterizar las páginas del PDF y dibujarlas en elementos `<canvas>` de HTML5 dentro del visor interactivo central.
- **`pdf-lib`**: Poderosa librería para la creación y manipulación estructural de PDFs en el cliente. Se usa para unir, dividir, rotar, inyectar imágenes (firmas), dibujar formas (censura), escribir texto, e interactuar con formularios (AcroForms) modificando los bytes del archivo directamente en la memoria del navegador.
- **`react-dropzone`**: Maneja la lógica de arrastrar y soltar (Drag & Drop) para la carga de archivos, tanto en la pantalla de bienvenida como en herramientas específicas (subir imágenes de firmas).
- **`lucide-react`**: Colección de íconos vectoriales SVG limpios y consistentes usados en toda la aplicación.
- **`clsx` / `tailwind-merge`**: Utilidades para combinar y resolver condicionalmente clases de Tailwind CSS sin conflictos.
- **`jszip`**: Utilizado para empaquetar múltiples archivos (por ejemplo, cuando se extraen todas las páginas de un PDF a imágenes JPG y se descargan en un solo archivo comprimido).

### Backend (Librerías y Motores)
- **`FastAPI` (Python)**: Framework web ultrarrápido para construir los endpoints asíncronos de la API.
- **`uvicorn`**: Servidor ASGI de alto rendimiento para correr la aplicación FastAPI.
- **`PyMuPDF` / `pikepdf`**: Compresión y optimización de PDFs (limpieza de objetos, recompresión de streams y, en modo agresivo, re-muestreo de imágenes a JPEG) y censura real de contenido.
- **`Ghostscript`**: Instalado en el contenedor como dependencia de `ocrmypdf` para optimizar escaneos.
- **`Tesseract OCR`**: Motor de reconocimiento óptico de caracteres de Google, invocado desde el backend para extraer texto de PDFs escaneados (imágenes) y volverlos seleccionables.
- **`LibreOffice / unoconv`**: Herramientas a nivel de sistema integradas en la imagen de Docker para convertir fielmente documentos de Office (Word, Excel, PowerPoint) a formato PDF.
- **Gestión de Entorno**: Docker & Docker Compose.

---

## 📂 Estructura del Proyecto

```text
PDF_ANTIGRAVITY/
├── docker-compose.yml       # Entorno de desarrollo (Vite + FastAPI)
├── deploy.sh                # Actualización y despliegue en el servidor
├── deployment/              # Producción: docker-compose.prod.yml + Nginx (HTTPS, CSP, rate limit)
├── README.md                # Este archivo de documentación
│
├── frontend/                # Aplicación Web SPA (React + Vite)
│   ├── Dockerfile           # Build de producción (Vite) servido por Nginx
│   ├── Dockerfile.dev       # Contenedor de desarrollo para UI
│   ├── package.json         # Dependencias (pnpm): React, pdf-lib, pdf.js, Tailwind
│   ├── scripts/             # copy-pdfjs-assets.mjs: copia CMaps/fuentes/WASM de pdf.js a public/pdfjs/
│   ├── tailwind.config.js   # Configuración de estilos y Dark Mode
│   └── src/
│       ├── App.tsx          # Punto de entrada principal y enrutador de herramientas
│       ├── context/         # Estados globales
│       │   ├── PdfContext.tsx       # Gestiona el ArrayBuffer del PDF y la generación de miniaturas
│       │   ├── WorkspaceContext.tsx # Gestiona las capas interactivas (overlays) sobre el visor
│       │   └── ThemeContext.tsx     # Gestiona el Modo Oscuro
│       ├── components/
│       │   ├── workspace/   # Componentes del paradigma "Documento Central" (Visor, Miniaturas, Dropzone)
│       │   ├── tools/       # Cada uno de los módulos de edición (Firmar, Censurar, Rotar, etc.)
│       │   └── ui/          # Componentes reutilizables (Botones, Inputs)
│       ├── config/          # URL del backend y configuración única de pdf.js
│       ├── hooks/           # Lógica reutilizable
│       ├── utils/           # Renderizado, caché de miniaturas, geometría de página, descargas
│       └── workers/         # Web Worker de pdf-lib (rotar/eliminar páginas sin bloquear la UI)
│
└── backend/                 # API de Procesamiento Pesado (Python)
    ├── Dockerfile           # Contenedor del backend
    ├── requirements.txt     # Dependencias de Python (FastAPI, uvicorn)
    └── main.py              # Endpoints REST (/api/compress, /api/ocr, /api/redact-visual, etc.)
```

---

## 🎨 Usabilidad y Experiencia de Usuario (UX)

La aplicación rompe con el formato tradicional de "formularios web" para ofrecer un **Paradigma de Documento Central**:

1. **Visor Interactivo:** El documento siempre está en el centro. Herramientas como *Censurar*, *Anotar* o *Firmar* permiten dibujar, arrastrar y soltar elementos directamente sobre las páginas del PDF.
2. **Acciones Inmediatas (QoL):** A través del panel lateral de miniaturas, el usuario puede rotar o eliminar páginas individuales con un solo clic. Los cambios se reflejan instantáneamente sin necesidad de recargar.
3. **Procesamiento 100% en Navegador:** Para funciones críticas de privacidad (Firmas, Marcas de Agua, Reorganización), el archivo nunca abandona la computadora del usuario. Todo se procesa usando los recursos locales (`pdf-lib`), lo que garantiza velocidad y seguridad.
4. **Modo Oscuro:** Integración nativa de un tema oscuro amigable a la vista para lecturas nocturnas, controlable con un solo clic.
5. **Aceleración Asíncrona:** Mientras el usuario explora el documento, las miniaturas se generan silenciosamente en segundo plano para no bloquear el hilo principal.

---

## 🚀 Guía para Levantar el Proyecto en Docker

El entorno está completamente dockerizado para garantizar que se ejecute de la misma manera en cualquier computadora, sin necesidad de instalar Python o Node.js manualmente.

### Prerrequisitos
- Tener instalado [Docker Desktop](https://www.docker.com/products/docker-desktop/) (en Windows/Mac) o Docker Engine (Linux).

### Pasos
1. **Abrir una terminal** y navegar a la raíz del proyecto (donde se encuentra el archivo `docker-compose.yml`).
2. **Construir y levantar los contenedores** ejecutando:
   ```bash
   docker compose up --build -d
   ```
   *(El flag `-d` levanta los contenedores en segundo plano).*

3. **Acceder a la aplicación:**
   - **Frontend (Interfaz Gráfica):** Abre tu navegador web en `http://localhost:5173`
   - **Backend (API / Documentación Swagger):** Disponible en `http://localhost:8000/docs` (solo desde la propia máquina). El frontend llega al backend a través del proxy de Vite (`/api`), igual que en producción a través de Nginx.

4. **Para detener el proyecto:**
   ```bash
   docker compose down
   ```

5. **Para ver los logs en tiempo real (si hay errores):**
   ```bash
   docker compose logs -f
   ```

---

## ✨ Funcionalidades Principales

### Edición Directa y Marcado (Frontend Local)
- 📝 **Anotar:** Añadir cajas de texto libre y dibujo a mano alzada.
- 🖋️ **Firmar:** Subir imágenes de firmas, arrastrarlas por cualquier página y redimensionarlas.
- 💧 **Marca de Agua:** Imprimir textos masivos o centrados en múltiples ángulos y colores.
- ✅ **Formularios:** Detección automática de AcroForms (cajas de texto, checkboxes) para rellenado interactivo.

### Gestión de Páginas (Frontend Local)
- 🔄 **Reorganizar:** Arrastrar y soltar (Drag & Drop) páginas para cambiar su orden.
- ✂️ **Unir y Dividir:** Mezclar múltiples PDFs o extraer un rango de páginas específico.
- 📐 **Rotar y Eliminar:** A nivel de documento entero o página por página.
- 🔒 **Seguridad:** Encriptar documentos con contraseña o desbloquearlos.

### Tareas Pesadas (Delegadas al Backend)
- 🗜️ **Comprimir:** Reducción del tamaño de archivo conservando formularios, enlaces y adjuntos (PyMuPDF + pikepdf).
- 👁️ **OCR (Reconocimiento Óptico):** Convertir PDFs de imágenes escaneadas en texto seleccionable (español, inglés, francés, alemán y portugués).
- ⬛ **Censurar:** Eliminación definitiva del contenido de las áreas marcadas en el visor.
- 📄 **Conversión de Formatos:** De PDF a Word/Excel/PPTX/JPG y viceversa.
