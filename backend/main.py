from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import quote
import pikepdf
import pymupdf  # PyMuPDF (fitz)
import io
import asyncio
import zipfile
import pdfplumber
import openpyxl
from openpyxl.cell.cell import ILLEGAL_CHARACTERS_RE
from pptx import Presentation
from pptx.util import Inches
from PIL import Image
import tempfile
import os
import re
import sys
import signal
import subprocess
import json
import logging

# ─── Logger (registra errores internos sin exponerlos al cliente) ──────────────
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("pdf-antigravity")

# ─── Límites de recursos (protección DoS) ─────────────────────────────────────
# Tamaño máximo de subida. Nginx ya limita a 100 MB en producción, pero el backend
# no debe depender de eso (en desarrollo el puerto 8000 queda expuesto directamente).
MAX_UPLOAD_BYTES = int(os.environ.get("MAX_UPLOAD_MB", "100")) * 1024 * 1024
# Píxeles máximos por página renderizada (~40 MP ≈ 120 MB en RGB). Evita que un PDF
# con páginas gigantes (ej. 14400×14400 pt) genere pixmaps de varios GB.
MAX_RENDER_PIXELS = 40_000_000
# Páginas máximas en conversiones que rasterizan cada página.
MAX_RENDER_PAGES = 500
# Áreas máximas por petición de censura.
MAX_REDACT_AREAS = 2000
# Páginas máximas para PDF → Word (pdf2docx tarda ~0,5-1 s por página) y PDF → Excel.
MAX_WORD_PAGES = 300
MAX_EXCEL_PAGES = 500
# Contraseña mínima al proteger (igual que la validación del frontend).
MIN_PASSWORD_LENGTH = 4
# Timeouts de procesos externos. Nginx corta la conexión a los 300 s,
# así que no tiene sentido seguir trabajando después de ese punto.
LIBREOFFICE_TIMEOUT = 120
OCR_TIMEOUT = 290
WORD_TIMEOUT = 280
# Idiomas de Tesseract instalados en la imagen (ver Dockerfile).
OCR_LANGUAGES = {"spa", "eng", "fra", "deu", "por"}

# ─── Semáforos de Concurrencia ────────────────────────────────────────────────
_ocr_semaphore: asyncio.Semaphore | None = None
_libreoffice_semaphore: asyncio.Semaphore | None = None
_convert_semaphore: asyncio.Semaphore | None = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _ocr_semaphore, _libreoffice_semaphore, _convert_semaphore
    _ocr_semaphore        = asyncio.Semaphore(2)  # Máx 2 OCR simultáneos
    _libreoffice_semaphore = asyncio.Semaphore(2)  # Máx 2 conversiones LibreOffice
    _convert_semaphore    = asyncio.Semaphore(4)  # Máx 4 operaciones PDF simultáneas
    yield  # La app corre aquí
    # (cleanup si fuera necesario)

app = FastAPI(
    title="CamePDF API",
    description="Suite empresarial de manipulación de PDFs. Procesos pesados asíncronos con semáforos de concurrencia.",
    version="3.3.0",
    lifespan=lifespan,
)

# ✅ CORS seguro — leer origen desde variable de entorno.
_allowed_origin = os.environ.get("ALLOWED_ORIGIN", "http://localhost:5173")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[_allowed_origin],
    # La API no usa cookies ni autenticación HTTP: no hace falta permitir credenciales.
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Original-Size", "X-Compressed-Size", "X-Reduction-Percent", "X-Result-Size"],
)

# ✅ Handler global de errores — loguea internamente, nunca expone detalles al cliente.
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Error no controlado en {request.url}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Error interno del servidor. Por favor, intente de nuevo."},
    )


# ─── UTILIDADES DE SEGURIDAD ──────────────────────────────────────────────────

def safe_filename(raw: str | None, default: str = "output") -> str:
    """
    [SEGURIDAD] Sanitiza el nombre de archivo para uso en:
    1. Headers HTTP Content-Disposition (previene header injection)
    2. os.path.join (previene path traversal)

    - os.path.basename: elimina cualquier ruta (ej. '../../etc/passwd' → 'passwd')
    - re.sub: elimina caracteres de control y CR/LF que romperían el header HTTP
    - strip/fallback: evita nombres vacíos o que empiecen con punto
    """
    name = os.path.basename(raw or default).strip()
    name = re.sub(r'[\r\n\x00-\x1f"\\]', '_', name)  # Elimina chars peligrosos en headers
    if not name or name.startswith('.'):
        name = default
    return name


def with_extension(filename: str, ext: str) -> str:
    """Reemplaza la extensión del archivo (insensible a mayúsculas: 'X.PDF' → 'X.docx')."""
    return os.path.splitext(filename)[0] + ext


def content_disposition(filename: str) -> str:
    """
    Construye un Content-Disposition válido para cualquier nombre (RFC 6266 / RFC 5987).
    Los headers HTTP solo admiten latin-1: un nombre como 'informe – final.pdf' hacía
    fallar la respuesta con UnicodeEncodeError. Se envía un fallback ASCII en `filename`
    y el nombre real codificado en UTF-8 en `filename*`.
    """
    ascii_fallback = re.sub(r'[^\x20-\x7e]', '_', filename)
    return f"attachment; filename=\"{ascii_fallback}\"; filename*=UTF-8''{quote(filename, safe='')}"


async def read_upload(file: UploadFile) -> bytes:
    """Lee el archivo subido rechazando los que superan MAX_UPLOAD_BYTES (413)."""
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"El archivo supera el límite de {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.")
    return data


def check_render_limits(doc: pymupdf.Document, zoom: float) -> None:
    """
    [DoS] Rechaza documentos cuya rasterización consumiría memoria excesiva:
    demasiadas páginas o páginas que, a este zoom, superan MAX_RENDER_PIXELS.
    """
    if len(doc) > MAX_RENDER_PAGES:
        raise HTTPException(413, f"El documento tiene demasiadas páginas (máximo {MAX_RENDER_PAGES}).")
    for page in doc:
        if page.rect.width * zoom * page.rect.height * zoom > MAX_RENDER_PIXELS:
            raise HTTPException(413, f"La página {page.number + 1} es demasiado grande para convertirla a imagen.")


def check_page_count(contents: bytes, max_pages: int) -> None:
    """
    [DoS] Rechaza PDFs protegidos o con más páginas de las que una conversión puede
    procesar a tiempo. Abrir con PyMuPDF solo lee la estructura: es rápido.
    """
    try:
        with pymupdf.open(stream=contents, filetype="pdf") as doc:
            if doc.needs_pass:
                raise HTTPException(400, "El PDF está protegido con contraseña. Quita la contraseña primero.")
            if len(doc) > max_pages:
                raise HTTPException(413, f"El documento tiene demasiadas páginas (máximo {max_pages}).")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(400, "El archivo no es un PDF válido o está dañado.")


def run_with_timeout(cmd: list[str], timeout: int, **kwargs) -> subprocess.CompletedProcess:
    """
    Ejecuta un proceso externo y, si excede el timeout, mata todo su grupo de procesos.
    subprocess.run(timeout=...) solo mata al proceso directo: LibreOffice (soffice → soffice.bin)
    y ocrmypdf (→ tesseract) seguirían consumiendo CPU/RAM en segundo plano.
    """
    with subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                          start_new_session=True, **kwargs) as proc:
        try:
            stdout, stderr = proc.communicate(timeout=timeout)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGKILL)
            proc.communicate()
            raise
        return subprocess.CompletedProcess(cmd, proc.returncode, stdout, stderr)


def append_text_row(ws, values: list[str | None]) -> None:
    """
    [SEGURIDAD] Añade una fila de texto extraído del PDF a la hoja de Excel:
    - Elimina caracteres de control que openpyxl rechaza (IllegalCharacterError).
    - Neutraliza inyección de fórmulas: openpyxl guarda como FÓRMULA cualquier texto
      que empiece por '=' (ej. '=HYPERLINK(...)'). Esas celdas se fuerzan a tipo texto.
    """
    ws.append([ILLEGAL_CHARACTERS_RE.sub("", v or "") for v in values])
    for cell in ws[ws.max_row]:
        if cell.data_type == "f":
            cell.data_type = "s"


# ─── ENDPOINTS ────────────────────────────────────────────────────────────────

@app.get("/")
def read_root():
    return {"message": "Welcome to CamePDF API v3.3.0"}



# ─── SEGURIDAD ────────────────────────────────────────────────────────────────

@app.post("/api/protect")
async def protect_pdf(file: UploadFile = File(...), password: str = Form(...)):
    if len(password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(400, f"La contraseña debe tener al menos {MIN_PASSWORD_LENGTH} caracteres.")
    try:
        contents = await read_upload(file)

        def process_protect():
            pdf_out = io.BytesIO()
            with pikepdf.open(io.BytesIO(contents)) as pdf:
                pdf.save(pdf_out, encryption=pikepdf.Encryption(owner=password, user=password, R=6))
            pdf_out.seek(0)
            return pdf_out

        async with _convert_semaphore:
            pdf_out = await asyncio.to_thread(process_protect)

        safe_name = safe_filename(file.filename, "protegido.pdf")
        return StreamingResponse(pdf_out, media_type="application/pdf",
            headers={"Content-Disposition": content_disposition(f"protegido_{safe_name}")})
    except HTTPException:
        raise
    except pikepdf.PasswordError:
        raise HTTPException(400, "El PDF ya está protegido o está dañado.")
    except Exception as e:
        logger.error(f"Error en /api/protect: {e}", exc_info=True)
        raise HTTPException(500, "Error al proteger el PDF. Intenta de nuevo.")


@app.post("/api/unlock")
async def unlock_pdf(file: UploadFile = File(...), password: str = Form(...)):
    try:
        contents = await read_upload(file)

        def process_unlock():
            pdf_out = io.BytesIO()
            with pikepdf.open(io.BytesIO(contents), password=password) as pdf:
                pdf.save(pdf_out)
            pdf_out.seek(0)
            return pdf_out

        async with _convert_semaphore:
            pdf_out = await asyncio.to_thread(process_unlock)

        safe_name = safe_filename(file.filename, "desbloqueado.pdf")
        return StreamingResponse(pdf_out, media_type="application/pdf",
            headers={"Content-Disposition": content_disposition(f"desbloqueado_{safe_name}")})
    except HTTPException:
        raise
    except pikepdf.PasswordError:
        raise HTTPException(401, "Contraseña incorrecta. Verifica e intenta de nuevo.")
    except Exception as e:
        logger.error(f"Error en /api/unlock: {e}", exc_info=True)
        raise HTTPException(500, "Error al desbloquear el PDF. Intenta de nuevo.")


# ─── COMPRIMIR ────────────────────────────────────────────────────────────────

@app.post("/api/compress")
async def compress_pdf(file: UploadFile = File(...), mode: str = Form("standard")):
    """
    Comprime el PDF con múltiples estrategias. Procesado asíncronamente para no bloquear.
    Ninguna estrategia altera el contenido: se conservan formularios, enlaces y adjuntos.
    """
    # ✅ Validar parámetro mode
    VALID_MODES = {"standard", "aggressive"}
    if mode not in VALID_MODES:
        raise HTTPException(400, f"Modo inválido '{mode}'. Opciones válidas: {', '.join(VALID_MODES)}")

    try:
        contents = await read_upload(file)
        original_size = len(contents)

        def process_compression():
            best_result = io.BytesIO(contents)
            best_size = original_size

            # ── Estrategia 1: PyMuPDF garbage=4 + deflate completo ─────────────────
            # ⚠️ No usar doc.scrub(): con sus valores por defecto vacía los campos de
            # formulario, elimina enlaces, adjuntos y metadatos (pérdida de datos).
            try:
                doc = pymupdf.open(stream=contents, filetype="pdf")
                attempt1 = io.BytesIO()
                doc.save(attempt1, garbage=4, deflate=True, deflate_images=True, deflate_fonts=True, clean=True)
                doc.close()
                size1 = attempt1.getbuffer().nbytes
                if size1 < best_size:
                    best_size = size1
                    best_result = attempt1
            except Exception:
                pass

            # ── Estrategia 2: pikepdf con recompresión flate ────────────────────────
            try:
                attempt2 = io.BytesIO()
                with pikepdf.open(io.BytesIO(contents)) as pdf:
                    pdf.save(attempt2, compress_streams=True, object_stream_mode=pikepdf.ObjectStreamMode.generate, recompress_flate=True, preserve_pdfa=False)
                size2 = attempt2.getbuffer().nbytes
                if size2 < best_size:
                    best_size = size2
                    best_result = attempt2
            except Exception:
                pass

            # ── Estrategia 3 (solo modo "aggressive"): Resamplear imágenes ──────────
            if mode == "aggressive":
                try:
                    doc = pymupdf.open(stream=contents, filetype="pdf")
                    done_xrefs: set[int] = set()
                    for page in doc:
                        for img_info in page.get_images(full=True):
                            xref, smask = img_info[0], img_info[1]
                            # Una imagen compartida entre páginas se procesa una sola vez.
                            # Las imágenes con máscara de transparencia (smask) se omiten:
                            # JPEG no tiene canal alfa y se perdería la transparencia.
                            if xref in done_xrefs or smask:
                                continue
                            done_xrefs.add(xref)
                            try:
                                base_img = doc.extract_image(xref)
                                img_bytes = base_img["image"]
                                if len(img_bytes) < 50_000:
                                    continue
                                pil_img = Image.open(io.BytesIO(img_bytes))
                                if max(pil_img.width, pil_img.height) > 1200:
                                    pil_img.thumbnail((1200, 1200), Image.LANCZOS)
                                out_buf = io.BytesIO()
                                pil_img.convert("RGB").save(out_buf, format="JPEG", quality=75, optimize=True)
                                if out_buf.getbuffer().nbytes >= len(img_bytes):
                                    continue
                                # ✅ replace_image reescribe el diccionario de la imagen
                                # (/Filter DCTDecode, /Width, /Height, /ColorSpace).
                                # update_stream solo cambiaba los bytes y dejaba el
                                # diccionario original → imagen corrupta.
                                page.replace_image(xref, stream=out_buf.getvalue())
                            except Exception:
                                continue
                    attempt3 = io.BytesIO()
                    doc.save(attempt3, garbage=4, deflate=True, deflate_images=True, deflate_fonts=True, clean=True)
                    doc.close()
                    size3 = attempt3.getbuffer().nbytes
                    if size3 < best_size:
                        best_size = size3
                        best_result = attempt3
                except Exception:
                    pass
            return best_result, best_size

        async with _convert_semaphore:
            best_result, best_size = await asyncio.to_thread(process_compression)

        best_result.seek(0)
        reduction_pct = max(0.0, (original_size - best_size) / original_size * 100) if original_size else 0.0
        safe_name = safe_filename(file.filename, "comprimido.pdf")

        return StreamingResponse(
            best_result,
            media_type="application/pdf",
            headers={
                "Content-Disposition": content_disposition(f"comprimido_{safe_name}"),
                "X-Original-Size": str(original_size),
                "X-Compressed-Size": str(best_size),
                "X-Reduction-Percent": f"{reduction_pct:.1f}",
                "Access-Control-Expose-Headers": "X-Original-Size,X-Compressed-Size,X-Reduction-Percent",
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en /api/compress: {e}", exc_info=True)
        raise HTTPException(500, "Error al comprimir el PDF. Intenta de nuevo.")


# ─── CONVERSIONES ─────────────────────────────────────────────────────────────

# Script que ejecuta pdf2docx en un proceso hijo (argv: entrada.pdf salida.docx).
_WORD_CONVERT_SCRIPT = (
    "import sys\n"
    "from pdf2docx import Converter\n"
    "cv = Converter(sys.argv[1])\n"
    "try:\n"
    "    cv.convert(sys.argv[2])\n"
    "finally:\n"
    "    cv.close()\n"
)


@app.post("/api/to-word")
async def pdf_to_word(file: UploadFile = File(...)):
    """
    Convierte PDF a DOCX usando pdf2docx en un proceso aparte: un hilo de Python no se
    puede cancelar, y un PDF complejo dejaba ocupado el semáforo indefinidamente.
    """
    try:
        contents = await read_upload(file)
        check_page_count(contents, MAX_WORD_PAGES)

        def process_word():
            with tempfile.TemporaryDirectory() as tmpdir:
                pdf_path = os.path.join(tmpdir, "input.pdf")
                docx_path = os.path.join(tmpdir, "output.docx")
                with open(pdf_path, "wb") as f:
                    f.write(contents)
                result = run_with_timeout(
                    [sys.executable, "-c", _WORD_CONVERT_SCRIPT, pdf_path, docx_path],
                    timeout=WORD_TIMEOUT,
                )
                if result.returncode != 0 or not os.path.exists(docx_path):
                    logger.error(f"pdf2docx terminó con código {result.returncode}: {result.stderr[-2000:]}")
                    raise RuntimeError("WORD_FAILED")
                with open(docx_path, "rb") as f:
                    return f.read()

        async with _convert_semaphore:
            try:
                docx_bytes = await asyncio.to_thread(process_word)
            except subprocess.TimeoutExpired:
                raise HTTPException(504, f"La conversión tardó demasiado (límite: {WORD_TIMEOUT} segundos). Prueba con menos páginas.")

        safe_name = with_extension(safe_filename(file.filename, "output.pdf"), ".docx")
        return StreamingResponse(
            io.BytesIO(docx_bytes),
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": content_disposition(safe_name)},
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en /api/to-word: {e}", exc_info=True)
        raise HTTPException(500, "Error al convertir a Word. Intenta de nuevo.")


@app.post("/api/to-pptx")
async def pdf_to_pptx(file: UploadFile = File(...)):
    """Convierte cada página del PDF en una diapositiva con imagen (PyMuPDF + python-pptx)."""
    try:
        contents = await read_upload(file)

        def process_pptx():
            doc = pymupdf.open(stream=contents, filetype="pdf")
            zoom = 2.0
            check_render_limits(doc, zoom)
            prs = Presentation()
            prs.slide_width = Inches(13.33)
            prs.slide_height = Inches(7.5)
            blank_layout = prs.slide_layouts[6]

            with tempfile.TemporaryDirectory() as tmpdir:
                for i, page in enumerate(doc):
                    mat = pymupdf.Matrix(zoom, zoom)
                    pix = page.get_pixmap(matrix=mat)
                    img_path = os.path.join(tmpdir, f"page_{i}.png")
                    pix.save(img_path)
                    slide = prs.slides.add_slide(blank_layout)
                    slide.shapes.add_picture(img_path, 0, 0, prs.slide_width, prs.slide_height)
                doc.close()

                pptx_path = os.path.join(tmpdir, "output.pptx")
                prs.save(pptx_path)
                with open(pptx_path, "rb") as f:
                    return f.read()

        async with _convert_semaphore:
            pptx_bytes = await asyncio.to_thread(process_pptx)

        safe_name = with_extension(safe_filename(file.filename, "output.pdf"), ".pptx")
        return StreamingResponse(
            io.BytesIO(pptx_bytes),
            media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
            headers={"Content-Disposition": content_disposition(safe_name)},
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en /api/to-pptx: {e}", exc_info=True)
        raise HTTPException(500, "Error al convertir a PowerPoint. Intenta de nuevo.")


@app.post("/api/to-excel")
async def pdf_to_excel(file: UploadFile = File(...)):
    """Extrae tablas del PDF y las exporta a XLSX usando pdfplumber + openpyxl."""
    try:
        contents = await read_upload(file)
        check_page_count(contents, MAX_EXCEL_PAGES)

        def process_excel():
            wb = openpyxl.Workbook()
            wb.remove(wb.active)
            tables_found = 0
            # El texto de cada página se guarda en la misma pasada, por si no hay tablas
            # (antes se volvía a abrir y recorrer todo el PDF).
            page_texts: list[str] = []
            with pdfplumber.open(io.BytesIO(contents)) as pdf:
                for page_num, page in enumerate(pdf.pages, start=1):
                    tables = page.extract_tables()
                    for table_idx, table in enumerate(tables):
                        tables_found += 1
                        sheet_name = f"Pag{page_num}_T{table_idx + 1}"
                        ws = wb.create_sheet(title=sheet_name)
                        for row in table:
                            append_text_row(ws, row)
                    if tables_found == 0:
                        page_texts.append(page.extract_text() or "")
                    page.close()  # libera la caché de objetos de la página
            if tables_found == 0:
                ws = wb.create_sheet(title="Texto_Extraido")
                for page_num, text in enumerate(page_texts, start=1):
                    ws.append([f"--- Página {page_num} ---"])
                    for line in text.split("\n"):
                        append_text_row(ws, [line])
                    ws.append([])
            xlsx_out = io.BytesIO()
            wb.save(xlsx_out)
            xlsx_out.seek(0)
            return xlsx_out

        async with _convert_semaphore:
            xlsx_out = await asyncio.to_thread(process_excel)

        safe_name = with_extension(safe_filename(file.filename, "output.pdf"), ".xlsx")
        return StreamingResponse(
            xlsx_out,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": content_disposition(safe_name)},
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en /api/to-excel: {e}", exc_info=True)
        raise HTTPException(500, "Error al convertir a Excel. Intenta de nuevo.")


@app.post("/api/to-jpg")
async def pdf_to_jpg(file: UploadFile = File(...), dpi: int = Form(150)):
    """
    Convierte páginas del PDF a imágenes JPG.
    1 página → devuelve JPG directo.
    Múltiples páginas → devuelve un ZIP con todos los JPGs.
    """
    # ✅ Clamp DPI para prevenir DoS (dpi=99999 generaría imágenes de GBs en RAM)
    dpi = max(72, min(dpi, 300))

    try:
        contents = await read_upload(file)
        safe_name = safe_filename(file.filename, "output.pdf")
        base_name = os.path.splitext(safe_name)[0]

        def process_jpg():
            """Devuelve (bytes del JPG, None) si hay una página, o (None, ZIP) si hay varias."""
            with pymupdf.open(stream=contents, filetype="pdf") as doc:
                zoom = dpi / 72.0
                check_render_limits(doc, zoom)
                mat = pymupdf.Matrix(zoom, zoom)
                if len(doc) == 1:
                    return doc[0].get_pixmap(matrix=mat).tobytes("jpeg"), None
                # Cada página va directa al ZIP (no se acumulan todas en memoria) y sin
                # comprimir: un JPEG ya está comprimido y deflate solo gastaba CPU.
                zip_out = io.BytesIO()
                with zipfile.ZipFile(zip_out, "w", zipfile.ZIP_STORED) as zf:
                    for i, page in enumerate(doc):
                        zf.writestr(f"pagina_{i + 1:03d}.jpg", page.get_pixmap(matrix=mat).tobytes("jpeg"))
                zip_out.seek(0)
                return None, zip_out

        async with _convert_semaphore:
            single_jpg, zip_out = await asyncio.to_thread(process_jpg)

        if single_jpg is not None:
            return StreamingResponse(
                io.BytesIO(single_jpg),
                media_type="image/jpeg",
                headers={"Content-Disposition": content_disposition(f"{base_name}.jpg")},
            )

        return StreamingResponse(
            zip_out,
            media_type="application/zip",
            headers={"Content-Disposition": content_disposition(f"{base_name}_imagenes.zip")},
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en /api/to-jpg: {e}", exc_info=True)
        raise HTTPException(500, "Error al convertir a JPG. Intenta de nuevo.")


# ─── CENSURAR (REDACTAR) ──────────────────────────────────────────────────────

@app.post("/api/redact-visual")
async def redact_visual(
    file: UploadFile = File(...),
    areas: str = Form(...),  # JSON: [{page, x1r, y1r, x2r, y2r}] — ratios 0-1
):
    """
    Censura REAL de áreas del PDF: elimina el texto, las imágenes y los vectores que
    caen dentro de cada área (no solo los tapa) y las rellena de negro.

    Las coordenadas son proporciones (0.0 a 1.0) de la página TAL COMO SE VE en el visor,
    es decir, con la rotación (/Rotate) y el CropBox ya aplicados. Se convierten al
    espacio sin rotar de la página con `derotation_matrix`.
    """
    # ✅ Validar JSON antes de leer el archivo
    try:
        redact_areas = json.loads(areas)
    except json.JSONDecodeError:
        raise HTTPException(400, "JSON malformado en el parámetro 'areas'.")
    if not isinstance(redact_areas, list) or not redact_areas:
        raise HTTPException(400, "El parámetro 'areas' debe ser una lista JSON no vacía.")
    if len(redact_areas) > MAX_REDACT_AREAS:
        raise HTTPException(400, f"Demasiadas áreas de censura (máximo {MAX_REDACT_AREAS}).")

    required = ("page", "x1r", "y1r", "x2r", "y2r")
    parsed: list[tuple[int, float, float, float, float]] = []
    for area in redact_areas:
        if not isinstance(area, dict) or not all(k in area for k in required):
            raise HTTPException(400, f"Cada área debe ser un objeto con los campos: {', '.join(required)}.")
        try:
            page_idx = int(area["page"])
            # ✅ Clamp ratios entre 0 y 1
            x1, y1, x2, y2 = (max(0.0, min(1.0, float(area[k]))) for k in required[1:])
        except (TypeError, ValueError):
            raise HTTPException(400, "Las coordenadas del área deben ser numéricas.")
        parsed.append((page_idx, min(x1, x2), min(y1, y2), max(x1, x2), max(y1, y2)))

    try:
        contents = await read_upload(file)

        def process_redact():
            doc = pymupdf.open(stream=contents, filetype="pdf")
            if doc.needs_pass:
                raise HTTPException(400, "El PDF está protegido con contraseña. Quita la contraseña primero.")
            touched_pages: set[int] = set()
            for page_idx, x1, y1, x2, y2 in parsed:
                if not 0 <= page_idx < len(doc):
                    raise HTTPException(400, f"Índice de página inválido: {page_idx}.")
                page = doc[page_idx]
                pw, ph = page.rect.width, page.rect.height  # tamaño visible (rotado)
                view_rect = pymupdf.Rect(x1 * pw, y1 * ph, x2 * pw, y2 * ph)
                page.add_redact_annot(view_rect * page.derotation_matrix, fill=(0, 0, 0))
                touched_pages.add(page_idx)
            for page_idx in touched_pages:
                doc[page_idx].apply_redactions()
            # garbage=4 descarta objetos huérfanos para que el contenido eliminado
            # no sobreviva en el archivo como objeto sin referenciar.
            out = doc.tobytes(garbage=4, deflate=True)
            doc.close()
            return out

        async with _convert_semaphore:
            pdf_bytes = await asyncio.to_thread(process_redact)

        safe_name = safe_filename(file.filename, "documento.pdf")
        return StreamingResponse(io.BytesIO(pdf_bytes), media_type="application/pdf",
            headers={"Content-Disposition": content_disposition(f"censurado_{safe_name}")})
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en /api/redact-visual: {e}", exc_info=True)
        raise HTTPException(500, "Error al censurar el PDF. Intenta de nuevo.")


# ─── OFFICE → PDF ─────────────────────────────────────────────────────────────

@app.post("/api/office-to-pdf")
async def office_to_pdf(file: UploadFile = File(...)):
    """
    Convierte archivos Office (DOCX, XLSX, PPTX, ODT, CSV, TXT) a PDF
    usando LibreOffice en modo headless.
    Soporta: .docx .doc .odt .xlsx .xls .ods .pptx .ppt .odp .csv .txt .rtf
    """
    ALLOWED_EXTENSIONS = {
        ".docx", ".doc", ".odt", ".rtf",   # Writer
        ".xlsx", ".xls", ".ods", ".csv",    # Calc
        ".pptx", ".ppt", ".odp",            # Impress
        ".txt",
    }

    # ✅ [CRÍTICO] Sanitizar nombre de archivo ANTES de cualquier operación de sistema de archivos.
    # os.path.basename previene path traversal: "../../../etc/passwd" → "passwd"
    raw_filename = file.filename or "documento"
    filename = safe_filename(raw_filename, "documento")
    ext = os.path.splitext(filename)[1].lower()

    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            400,
            f"Formato no soportado: '{ext}'. "
            f"Formatos aceptados: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        )

    try:
        contents = await read_upload(file)

        def process_office():
            with tempfile.TemporaryDirectory() as tmpdir:
                # ✅ Usar el nombre sanitizado, nunca el original del usuario
                input_path = os.path.join(tmpdir, filename)
                with open(input_path, "wb") as f:
                    f.write(contents)

                # ✅ Perfil de LibreOffice propio por conversión:
                # - appuser no tiene HOME escribible (--no-create-home) → LibreOffice no
                #   puede crear su perfil por defecto.
                # - Dos instancias que comparten perfil se bloquean entre sí, lo que rompía
                #   las conversiones simultáneas que permite el semáforo.
                profile_uri = Path(tmpdir, "lo_profile").as_uri()
                try:
                    result = run_with_timeout(
                        ["libreoffice", f"-env:UserInstallation={profile_uri}",
                         "--headless", "--norestore", "--nofirststartwizard",
                         "--convert-to", "pdf", "--outdir", tmpdir, input_path],
                        timeout=LIBREOFFICE_TIMEOUT,
                        env={**os.environ, "HOME": tmpdir},
                    )
                except subprocess.TimeoutExpired:
                    raise RuntimeError("TIMEOUT")

                if result.returncode != 0:
                    logger.error(f"LibreOffice error: {result.stderr}")
                    raise RuntimeError("LIBREOFFICE_FAILED")

                pdf_name = os.path.splitext(filename)[0] + ".pdf"
                pdf_path = os.path.join(tmpdir, pdf_name)
                if not os.path.exists(pdf_path):
                    logger.error(f"LibreOffice no generó salida: {result.stdout} {result.stderr}")
                    raise RuntimeError("OUTPUT_NOT_FOUND")

                with open(pdf_path, "rb") as f:
                    return f.read(), pdf_name

        async with _libreoffice_semaphore:
            pdf_bytes, pdf_name = await asyncio.to_thread(process_office)

        safe_pdf_name = safe_filename(pdf_name, "output.pdf")
        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={"Content-Disposition": content_disposition(safe_pdf_name)},
        )
    except HTTPException:
        raise
    except Exception as e:
        if "TIMEOUT" in str(e):
            raise HTTPException(504, f"La conversión tardó demasiado (límite: {LIBREOFFICE_TIMEOUT} segundos). El archivo puede ser muy complejo.")
        logger.error(f"Error en /api/office-to-pdf: {e}", exc_info=True)
        raise HTTPException(500, "Error al convertir el archivo. Intenta de nuevo.")


# ─── OCR ──────────────────────────────────────────────────────────────────────

# Códigos de salida de ocrmypdf (ocrmypdf.ExitCode)
_OCR_EXIT_ALREADY_DONE = 6
_OCR_EXIT_ENCRYPTED = 8


def validate_ocr_language(language: str) -> str:
    """Acepta solo combinaciones de idiomas instalados, ej. 'spa', 'spa+eng'."""
    parts = language.split("+")
    if not parts or len(parts) > len(OCR_LANGUAGES) or not all(p in OCR_LANGUAGES for p in parts):
        raise HTTPException(400, f"Idioma de OCR no soportado: '{language}'. Disponibles: {', '.join(sorted(OCR_LANGUAGES))}.")
    return language


async def run_ocr(file: UploadFile, language: str, deskew: bool, force: bool) -> StreamingResponse:
    """
    Ejecuta ocrmypdf como proceso externo (no como librería) para poder imponer un
    timeout real: un hilo de Python no se puede cancelar, y un PDF de cientos de
    páginas mantendría ocupado el semáforo de OCR mucho después de que nginx cortara.
    """
    language = validate_ocr_language(language)
    contents = await read_upload(file)

    def process_ocr():
        with tempfile.TemporaryDirectory() as tmpdir:
            input_path = os.path.join(tmpdir, "input.pdf")
            output_path = os.path.join(tmpdir, "output_ocr.pdf")
            with open(input_path, "wb") as f:
                f.write(contents)
            cmd = ["ocrmypdf", "--language", language, "--optimize", "1", "--quiet"]
            if deskew:
                cmd.append("--deskew")
            if force:
                cmd.append("--force-ocr")
            else:
                cmd += ["--skip-text", "--oversample", "300"]
            cmd += [input_path, output_path]
            result = run_with_timeout(cmd, timeout=OCR_TIMEOUT)
            if result.returncode == _OCR_EXIT_ALREADY_DONE:
                raise HTTPException(409, "Este PDF ya contiene texto seleccionable. Usa 'Forzar re-OCR'.")
            if result.returncode == _OCR_EXIT_ENCRYPTED:
                raise HTTPException(400, "El PDF está protegido con contraseña. Quita la contraseña primero.")
            if result.returncode != 0:
                logger.error(f"ocrmypdf terminó con código {result.returncode}: {result.stderr}")
                raise RuntimeError("OCR_FAILED")
            with open(output_path, "rb") as f:
                return f.read()

    try:
        async with _ocr_semaphore:
            result_bytes = await asyncio.to_thread(process_ocr)
    except HTTPException:
        raise
    except subprocess.TimeoutExpired:
        raise HTTPException(504, f"El OCR tardó demasiado (límite: {OCR_TIMEOUT} segundos). Prueba con menos páginas.")
    except Exception as e:
        logger.error(f"Error en OCR: {e}", exc_info=True)
        raise HTTPException(500, "Error durante el OCR. Intenta de nuevo.")

    safe_name = safe_filename(file.filename, "documento.pdf")
    filename_out = os.path.splitext(safe_name)[0] + "_OCR.pdf"
    return StreamingResponse(
        io.BytesIO(result_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": content_disposition(filename_out),
            "X-Original-Size": str(len(contents)),
            "X-Result-Size": str(len(result_bytes)),
            "Access-Control-Expose-Headers": "X-Original-Size,X-Result-Size",
        },
    )


@app.post("/api/ocr")
async def ocr_pdf(
    file: UploadFile = File(...),
    language: str = Form("spa+eng"),
    deskew: bool = Form(True),
):
    """Aplica OCR asíncronamente con protección de concurrencia."""
    return await run_ocr(file, language, deskew, force=False)


@app.post("/api/ocr-force")
async def ocr_pdf_force(
    file: UploadFile = File(...),
    language: str = Form("spa+eng"),
    deskew: bool = Form(True),
):
    """Igual que /api/ocr pero fuerza el re-procesamiento."""
    return await run_ocr(file, language, deskew, force=True)
