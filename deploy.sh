#!/bin/bash
# deploy.sh
# Script de actualización automática para PDF Antigravity.
# Uso: ./deploy.sh
# Ejecutar desde la raíz del repositorio: /home/oelozano/PDF_ANTIGRAVITY/

set -e  # Detener si ocurre cualquier error

echo "======================================"
echo "  PDF Antigravity — Deploy Script"
echo "======================================"

# ── 1. Verificar que el archivo .env existe ────────────────────────────────────
if [ ! -f "deployment/.env" ]; then
  echo ""
  echo "ERROR: No se encontró deployment/.env"
  echo "Crea el archivo con tu IP antes de continuar:"
  echo "  echo \"ALLOWED_ORIGIN=https://TU_IP\" > deployment/.env"
  echo ""
  exit 1
fi

echo "✅ Archivo .env encontrado."

# ── 2. Guardar el estado actual y traer cambios de GitHub ─────────────────────
echo ""
echo "📥 Descargando últimos cambios de GitHub..."

# Descartar cualquier cambio local en archivos rastreados (excepto .env que está ignorado)
git fetch origin main
git reset --hard origin/main

echo "✅ Código actualizado al último commit."

# ── 3. Reconstruir y levantar los contenedores ────────────────────────────────
echo ""
echo "🐳 Reconstruyendo contenedores Docker..."

docker compose -f deployment/docker-compose.prod.yml up -d --build

echo ""
echo "======================================"
echo "✅ Despliegue completado exitosamente."
echo "======================================"

# ── 4. Mostrar estado final ───────────────────────────────────────────────────
echo ""
docker compose -f deployment/docker-compose.prod.yml ps
