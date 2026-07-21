# ─── Etapa 1: Construcción (Build) ──────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
# Construye la aplicación estática
RUN npm run build

# ─── Etapa 2: Servidor Web (Nginx) ──────────────────────────────────────────
FROM nginx:alpine

# Copiamos la build estática de Vite a la carpeta pública de Nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# Configuramos Nginx para soportar el enrutador de React (Single Page Application)
RUN echo 'server { \
    listen ${PORT:-80}; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html index.htm; \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

# Reemplazamos las variables de entorno de Nginx en tiempo de ejecución (para que Railway asigne el puerto)
CMD sh -c "envsubst '\\$PORT' < /etc/nginx/conf.d/default.conf > /etc/nginx/conf.d/default.conf.tmp && mv /etc/nginx/conf.d/default.conf.tmp /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"
