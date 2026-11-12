/**
 * scripts/preparar-estatico.mjs
 *
 * Arma la carpeta `frontend/public/` con lo unico que debe servirse como sitio
 * estatico.
 *
 * ¿Por qué? Vercel no sirve "el repo" como web: sirve el `outputDirectory`.
 * Armarlo aquí mantiene el repositorio organizado como está (HTML en
 * Angular y sus recursos) y garantiza que ni `backend/`
 * ni los `.env` queden expuestos publicly.
 *
 * Uso:  node scripts/preparar-estatico.mjs
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPrivateStaticPath } from '../backend/src/middleware/staticSecurity.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FRONTEND = path.join(RAIZ, 'frontend');
const DESTINO = path.join(FRONTEND, 'public');
const DIST_ANGULAR = path.join(FRONTEND, 'angular', 'dist', 'angular', 'browser');

const RAIZ_SITIO = ['robots.txt'];

const copiar = (desde, hasta) => {
  const stat = fs.statSync(desde);
  if (isPrivateStaticPath('/' + path.relative(RAIZ, desde).split(path.sep).join('/'))) return 0;
  if (stat.isDirectory()) {
    fs.mkdirSync(hasta, { recursive: true });
    for (const entrada of fs.readdirSync(desde)) {
      if (entrada === 'node_modules' || entrada.startsWith('.')) continue;
      copiar(path.join(desde, entrada), path.join(hasta, entrada));
    }
    return 1;
  }
  // Las declaraciones de tipo no son recursos del navegador.
  if (/\.d\.ts$/i.test(desde)) return 0;
  fs.mkdirSync(path.dirname(hasta), { recursive: true });
  fs.copyFileSync(desde, hasta);
  return 1;
};

const contar = dir => {
  let total = 0;
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    total += entrada.isDirectory() ? contar(path.join(dir, entrada.name)) : 1;
  }
  return total;
};

// Validar toda la configuración antes de reemplazar la salida existente.
const site = process.env.PUBLIC_SITE_URL ? new URL(process.env.PUBLIC_SITE_URL) : null;
if (site && (site.protocol !== 'https:' || site.username || site.password || site.search || site.hash || site.pathname !== '/')) {
  throw new Error('PUBLIC_SITE_URL debe ser un origen HTTPS sin ruta ni credenciales');
}

// Compilar antes de tocar el sitio servido. Si falla, conservar la salida anterior.
// No reutilizar dist: podría pertenecer a una versión vieja del código.
try {
  execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
    cwd: path.join(FRONTEND, 'angular'),
    stdio: 'inherit',
  });
} catch {
  console.error('No se pudo compilar Angular. Instala sus dependencias con npm ci --prefix frontend/angular.');
  process.exit(1);
}
if (!fs.existsSync(path.join(DIST_ANGULAR, 'index.html'))) {
  console.error('El build de Angular no generó index.html. Se conserva el sitio anterior.');
  process.exit(1);
}
fs.rmSync(DESTINO, { recursive: true, force: true });
fs.mkdirSync(DESTINO, { recursive: true });
copiar(DIST_ANGULAR, DESTINO);
const faltantes = [];

for (const archivo of RAIZ_SITIO) {
  const origen = path.join(FRONTEND, archivo);
  if (!fs.existsSync(origen)) { faltantes.push(archivo); continue; }
  copiar(origen, path.join(DESTINO, archivo));
}

// El dominio se define al desplegar; no publicar un sitemap de un dominio ajeno.
if (site) {
  const pages = ['/', '/tienda', '/catalogo/maquillaje', '/catalogo/cabello', '/looks', '/contacto'];
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + pages.map(route => `<url><loc>${site.origin}${route}</loc></url>`).join('') + '</urlset>\n';
  fs.writeFileSync(path.join(DESTINO, 'sitemap.xml'), xml);
  fs.appendFileSync(path.join(DESTINO, 'robots.txt'), `Sitemap: ${site.origin}/sitemap.xml\n`);
}

console.log(`Estático preparado en frontend/public/ -> ${contar(DESTINO)} archivos`);
if (faltantes.length) {
  console.error(`FALTA en frontend/: ${faltantes.join(', ')}`);
  process.exit(1);
}
