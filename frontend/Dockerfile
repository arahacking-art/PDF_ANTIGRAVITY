# ─── Etapa 1: Construcción (Build) ──────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ─── Etapa 2: Servidor Web (Nginx) ──────────────────────────────────────────
FROM nginx:alpine

# Railway inyecta $PORT. Valor por defecto: 8080.
ENV PORT=8080

# Copiamos la build estática al directorio público de Nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# Eliminamos la config por defecto de Nginx (viene con puerto 80 hardcodeado)
RUN rm /etc/nginx/conf.d/default.conf

# Al arrancar: generamos la config con el $PORT real y lanzamos Nginx
CMD ["/bin/sh", "-c", "echo \"server { listen ${PORT}; location / { root /usr/share/nginx/html; index index.html; try_files \\$uri \\$uri/ /index.html; } }\" > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
