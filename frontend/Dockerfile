# ─── Etapa 1: Construcción (Build) ──────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ─── Etapa 2: Servidor Web (Nginx) ──────────────────────────────────────────
FROM nginx:alpine

# Railway inyecta $PORT en tiempo de ejecución. Usamos 8080 como valor por defecto.
ENV PORT=8080

# Copiamos la build estática al directorio público de Nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# Creamos el template de configuración de Nginx usando $PORT simple
# (envsubst NO soporta ${PORT:-80}, por eso usamos ENV para el valor por defecto)
RUN printf 'server {\n    listen %s;\n    location / {\n        root /usr/share/nginx/html;\n        index index.html index.htm;\n        try_files $uri $uri/ /index.html;\n    }\n}\n' '$PORT' > /etc/nginx/templates/default.conf.template

# Usamos el mecanismo oficial de nginx:alpine para templates de entorno
# Esto sustituye $PORT en el template y lo coloca en conf.d/ automáticamente
CMD ["/bin/sh", "-c", "envsubst '$PORT' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
