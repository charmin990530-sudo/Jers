/**
 * scripts/preparar-estatico.mjs
 *
 * Arma la carpeta `public/` con lo único que debe servirse como sitio estático.
 *
 * ¿Por qué? Vercel no sirve "el repo" como web: sirve el `outputDirectory`.
 * Armarlo aquí mantiene el repositorio organizado como está (HTML junto al
 * backend, que es cómodo para trabajar en local) y garantiza que ni `backend/`
 * ni los `.env` queden expuestos publicly.
 *
 * Uso:  node scripts/preparar-estatico.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DESTINO = path.join(RAIZ, 'public');

// Páginas del sitio. Si se agrega una nueva, hay que listarla aquí.
const PAGINAS = [
  'index.html', 'bienvenida.html', 'cabello.html', 'checkout.html', 'contacto.html',
  'login.html', 'maquillaje.html', 'mi-perfil.html', 'mis-direcciones.html',
  'mis-pedidos.html', 'producto.html', 'register.html', 'reset-password.html', 'resenas.html',
  '404.html',
];

// Carpetas que se copian completas.
const CARPETAS = ['css', 'js', 'img', 'data', 'admin'];

const copiar = (desde, hasta) => {
  const stat = fs.statSync(desde);
  if (stat.isDirectory()) {
    fs.mkdirSync(hasta, { recursive: true });
    for (const entrada of fs.readdirSync(desde)) {
      if (entrada === 'node_modules' || entrada.startsWith('.')) continue;
      copiar(path.join(desde, entrada), path.join(hasta, entrada));
    }
    return 1;
  }
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

// Empezar de cero para que un archivo eliminado no quede huérfano en public/.
fs.rmSync(DESTINO, { recursive: true, force: true });
fs.mkdirSync(DESTINO, { recursive: true });

let copiados = 0;
const faltantes = [];

for (const pagina of PAGINAS) {
  const origen = path.join(RAIZ, pagina);
  if (!fs.existsSync(origen)) { faltantes.push(pagina); continue; }
  copiados += copiar(origen, path.join(DESTINO, pagina));
}

for (const carpeta of CARPETAS) {
  const origen = path.join(RAIZ, carpeta);
  if (!fs.existsSync(origen)) { faltantes.push(carpeta); continue; }
  copiados += copiar(origen, path.join(DESTINO, carpeta));
}

console.log(`Estático preparado en public/ -> ${contar(DESTINO)} archivos`);
if (faltantes.length) {
  console.error(`FALTA en el repositorio: ${faltantes.join(', ')}`);
  process.exit(1);
}
