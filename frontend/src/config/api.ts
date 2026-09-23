/**
 * api.ts
 * Centraliza la URL base del backend para todas las llamadas a la API.
 *
 * Estrategia:
 * - En PRODUCCIÓN (Docker + Nginx): No se define VITE_API_URL.
 *   Usamos una ruta relativa '/api' para que Nginx enrute la petición
 *   al contenedor backend internamente. Esto evita problemas de CORS,
 *   Mixed Content (HTTP/HTTPS) y URLs hardcodeadas.
 *
 * - En DESARROLLO LOCAL: Se puede definir VITE_API_URL=http://localhost:8000
 *   en un archivo .env.local para apuntar directamente al backend.
 */
const rawUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

// Quita slash final para evitar doble slash en los endpoints (ej: /api//protect)
export const BACKEND_URL = rawUrl.replace(/\/$/, '');
