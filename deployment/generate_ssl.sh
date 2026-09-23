#!/bin/bash
# generate_ssl.sh
# Este script genera certificados SSL autofirmados (privkey.pem y cert.pem)
# usando Docker, ideal para servidores Ubuntu/Linux.

# Detener el script si ocurre un error
set -e

# Obtener la ruta absoluta del directorio actual
SSL_DIR="$(pwd)/nginx/ssl"

# Crear el directorio si no existe (por si acaso)
mkdir -p "$SSL_DIR"

echo "Generando certificados SSL autofirmados con Docker en Ubuntu..."

# Generar certificados
docker run --rm -v "${SSL_DIR}:/ssl" alpine/openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout /ssl/privkey.pem -out /ssl/cert.pem -subj "/C=CO/ST=Valle/L=Cali/O=Cartones America/CN=localhost"

# Dar permisos correctos para que Nginx pueda leerlos en Linux
sudo chmod 644 "$SSL_DIR/cert.pem"
sudo chmod 600 "$SSL_DIR/privkey.pem"

echo "¡Certificados generados correctamente en $SSL_DIR!"
echo "- cert.pem"
echo "- privkey.pem"
