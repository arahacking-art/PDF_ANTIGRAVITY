import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // En desarrollo, el frontend llama a rutas relativas '/api/...' igual que en producción
    // (donde las enruta Nginx). Vite las reenvía al backend: así no hace falta exponer el
    // puerto 8000 ni configurar CORS. Dentro de docker compose, API_PROXY_TARGET apunta al
    // servicio 'backend'; fuera de Docker se usa localhost.
    proxy: {
      '/api': process.env.API_PROXY_TARGET ?? 'http://localhost:8000',
    },
  },
})
