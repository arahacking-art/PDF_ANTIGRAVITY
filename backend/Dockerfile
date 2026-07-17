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
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# ─── Dependencias Python ──────────────────────────────────────────────────────
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
