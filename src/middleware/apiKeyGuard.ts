import type { MiddlewareHandler } from 'hono';

/**
 * Hybrid Origin + API Key Guard
 *
 * - Allows requests from known frontend origins (komida.site, vercel.app, localhost)
 *   without requiring an API key (origin acts as the trust mechanism).
 * - Requires a valid `x-api-key` header for all other requests (curl, Postman, third-party).
 *
 * Public paths (/health, /api/uploads/*) are skipped.
 */

const ALLOWED_ORIGINS = [
  'localhost',
  '127.0.0.1',
  'komida.site',
  'vercel.app',
];

const PUBLIC_PATHS = [
  '/health',
  '/api/uploads',
  '/api/image/proxy',
];

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  return ALLOWED_ORIGINS.some((allowed) => origin.includes(allowed));
}

function isPublicPath(path: string): boolean {
  return PUBLIC_PATHS.some((publicPath) => path.startsWith(publicPath));
}

export const apiKeyGuard: MiddlewareHandler = async (c, next) => {
  const path = c.req.path;

  // Always allow CORS preflight
  if (c.req.method === 'OPTIONS') {
    return next();
  }

  // Skip public paths
  if (isPublicPath(path)) {
    return next();
  }

  const origin = c.req.header('Origin') || c.req.header('Referer') || '';

  // If origin is from a trusted frontend, bypass API key check
  if (isAllowedOrigin(origin)) {
    return next();
  }

  // Otherwise, require x-api-key
  const apiKey = c.req.header('x-api-key');
  const expectedKey = process.env.API_KEY;

  if (!expectedKey) {
    console.warn('[apiKeyGuard] API_KEY is not set in environment. Blocking external request.');
    return c.json({ error: 'Unauthorized: API key not configured' }, 401);
  }

  if (!apiKey || apiKey !== expectedKey) {
    return c.json({ error: 'Unauthorized: Invalid or missing API key' }, 401);
  }

  return next();
};
