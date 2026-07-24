/**
 * Backend API origin.
 * - Local: set VITE_API_URL=http://localhost:3001 in frontend/.env
 * - Production (Vercel): set VITE_API_URL=https://heybat-backend.onrender.com
 */
const raw = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export const API_ORIGIN = String(raw).replace(/\/$/, '');

/** Build absolute API URL, e.g. apiUrl('/api/suppliers') */
export function apiUrl(path) {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${API_ORIGIN}${normalized}`;
}
