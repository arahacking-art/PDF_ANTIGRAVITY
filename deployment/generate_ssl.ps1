# generate_ssl.ps1
# Este script genera certificados SSL autofirmados (privkey.pem y cert.pem) usando Docker
# para no requerir que instales OpenSSL localmente.

$sslDir = Join-Path $PWD "nginx/ssl"

Write-Host "Generando certificados SSL autofirmados con Docker..."
docker run --rm -v "${sslDir}:/ssl" alpine/openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout /ssl/privkey.pem -out /ssl/cert.pem -subj "/C=CO/ST=Valle/L=Cali/O=Cartones America/CN=localhost"

Write-Host "¡Certificados generados correctamente en deployment/nginx/ssl/!"
Write-Host "- cert.pem"
Write-Host "- privkey.pem"
