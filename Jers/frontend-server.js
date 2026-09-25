/**
 * frontend-server.js - Servidor estático simple para el frontend
 * 
 * USO:
 * node frontend-server.js
 * 
 * Sirve archivos estáticos desde el directorio actual (raíz del proyecto)
 * en http://localhost:5173
 * 
 * No requiere Python - usa Node.js nativo (http + fs + path)
 */

import { createServer } from 'http';
import { readFile, realpath } from 'fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const PORT = Number(process.env.FRONTEND_PORT) || 5173;
const ROOT_DIR = dirname(fileURLToPath(import.meta.url));
const PUBLIC_ROOTS = new Set(['css', 'js', 'img', 'admin', 'data']);
const PUBLIC_FILES = new Set([
  'index.html',
  'maquillaje.html',
  'cabello.html',
  'producto.html',
  'resenas.html',
  'contacto.html',
  'login.html',
  'register.html',
  'reset-password.html',
  'checkout.html',
  'mi-perfil.html',
  'mis-direcciones.html',
  'mis-pedidos.html',
  'bienvenida.html',
]);
const BLOCKED_NAMES = new Set(['.env', 'cookies.txt', 'frontend.log', 'server.log', 'package.json', 'package-lock.json']);

// Tipos MIME para archivos estáticos
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
};

const server = createServer(async (req, res) => {
  try {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      res.writeHead(405, { Allow: 'GET, HEAD, OPTIONS', 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('405 Method Not Allowed');
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }
    let urlPath = decodeURIComponent(new URL(req.url, `http://localhost:${PORT}`).pathname);
    if (urlPath === '/') urlPath = '/index.html';

    const requestedPath = resolve(join(ROOT_DIR, urlPath));
    const relativePath = relative(ROOT_DIR, requestedPath);
    const topLevel = relativePath.split(sep)[0];
    const fileName = relativePath.split(sep).at(-1);
    const isPublic = PUBLIC_ROOTS.has(topLevel) || PUBLIC_FILES.has(relativePath);
    const hasPrivateSegment = relativePath.split(sep).some(segment => segment.startsWith('.'));

    if (relativePath.startsWith('..') || !isPublic || hasPrivateSegment || BLOCKED_NAMES.has(fileName)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('403 Forbidden');
    }

    let realRequestedPath;
    try {
      const realRoot = await realpath(ROOT_DIR);
      realRequestedPath = await realpath(requestedPath);
      const realRelative = relative(realRoot, realRequestedPath);
      if (realRelative !== relativePath || realRelative.startsWith('..') || realRelative.includes(`..${sep}`)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('403 Forbidden');
      }
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found');
    }

    if (!existsSync(requestedPath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found');
    }

    const content = await readFile(realRequestedPath);
    const ext = extname(requestedPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const apiOrigin = (() => {
      try { return new URL(process.env.API_ORIGIN || 'http://localhost:3000').origin; } catch { return 'http://localhost:3000'; }
    })();
    const localSources = process.env.NODE_ENV === 'production' ? '' : ' http://localhost:* http://127.0.0.1:*';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Content-Security-Policy': `default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https: blob:; connect-src 'self' ${apiOrigin}${localSources}; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'`,
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-DNS-Prefetch-Control': 'off',
      'Origin-Agent-Cluster': '?1',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
      ...(process.env.NODE_ENV === 'production' ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload' } : {}),
    });
    res.end(content);
  } catch (error) {
    if (error instanceof URIError) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('400 Bad Request');
    }
    console.error('Error sirviendo archivo', { name: error.name });
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('500 Internal Server Error');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║  🌐 Frontend Server corriendo en puerto ${PORT}            ║
║  📁 Sirviendo desde: ${ROOT_DIR}                    ║
║  🔗 Abre: http://localhost:${PORT}/                        ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

// Manejo graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Cerrando servidor frontend...');
  server.close(() => process.exit(0));
});