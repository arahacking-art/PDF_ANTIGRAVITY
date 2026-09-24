# ─── Etapa 1: Construcción (Build) ──────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN corepack enable pnpm && pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

# ─── Etapa 2: Servidor Web (Nginx) ──────────────────────────────────────────
FROM nginx:alpine

# Copiamos la build estática al directorio público de Nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# ✅ FIX: Dar permisos correctos a todos los archivos estáticos para el usuario nginx
# Sin esto, archivos como favicon.svg producen 403 Permission Denied
RUN chmod -R 755 /usr/share/nginx/html && \
    chown -R nginx:nginx /usr/share/nginx/html

# ── Fix MIME type para .mjs (necesario para el worker de PDF.js) ─────────────
RUN sed -i 's|application/javascript\s*js;|application/javascript js mjs;|' /etc/nginx/mime.types

# Eliminamos la config por defecto — en producción la proveemos con el volumen
RUN rm /etc/nginx/conf.d/default.conf

# Arrancar Nginx directamente — la config ya está montada como volumen
CMD ["nginx", "-g", "daemon off;"]
