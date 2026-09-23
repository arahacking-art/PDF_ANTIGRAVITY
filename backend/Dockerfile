FROM python:3.13-slim

WORKDIR /app

# ─── Dependencias del sistema ─────────────────────────────────────────────────
# LibreOffice: conversión Office → PDF (headless, sin GUI)
# Tesseract: motor OCR + paquetes de idiomas español e inglés
# ghostscript + unpaper: requeridos por ocrmypdf para optimizar escaneos
RUN apt-get update && apt-get install -y --no-install-recommends \
        libreoffice \
        libreoffice-writer \
        libreoffice-calc \
        libreoffice-impress \
        tesseract-ocr \
        tesseract-ocr-spa \
        tesseract-ocr-eng \
        ghostscript \
        unpaper \
        libgl1 \
        libglib2.0-0 \
        # ✅ FIX IMPORTANTE: Fuentes tipográficas para que LibreOffice no rompa el formato
        fonts-liberation \
        fonts-dejavu \
        fonts-noto \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# ─── Dependencias Python ──────────────────────────────────────────────────────
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# ✅ HEALTHCHECK: Docker reiniciará el contenedor si FastAPI deja de responder
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/')" || exit 1

# ✅ FIX CRÍTICO: 1 worker. FastAPI es async y maneja múltiples peticiones con 1 proceso.
# Múltiples workers multiplican los semáforos de concurrencia y desbordan la RAM.
CMD sh -c "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"
