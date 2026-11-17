import { readFileSync } from 'node:fs';

const vercel = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));

describe('Rutas y caché de despliegue', () => {
  it('sirve la ruta pública del estudio también al abrirla directamente en Vercel', () => {
    expect(vercel.rewrites).toContainEqual({ source: '/estudio', destination: '/index.html' });
  });
  it('las imágenes editables del catálogo se revalidan y no quedan congeladas un año', () => {
    const headers = vercel.headers.find(rule => rule.source === '/img/(.*)').headers;
    expect(headers.find(header => header.key === 'Cache-Control').value).toBe('public, max-age=0, must-revalidate');
  });
});
