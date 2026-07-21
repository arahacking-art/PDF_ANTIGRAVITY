/**
 * api.ts
 * Centraliza la URL base del backend para todas las llamadas a la API.
 *
 * En producción (Railway), se usa la variable de entorno VITE_API_URL.
 * En desarrollo local (Docker), cae en localhost:8000.
 *
 * NOTA: Fuerza HTTPS automáticamente para evitar errores de Mixed Content
 * cuando el frontend corre en HTTPS (Railway) y el backend está en HTTP.
 */
const rawUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000';

// Quita slash final para evitar doble slash en los endpoints
const cleanUrl = rawUrl.replace(/\/$/, '');

// En producción (no localhost) siempre fuerza https://
export const BACKEND_URL = cleanUrl.startsWith('http://localhost')
  ? cleanUrl
  : cleanUrl.replace(/^http:\/\//i, 'https://');

