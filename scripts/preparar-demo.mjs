/** Demo de portafolio: solo frontend, catálogo de muestra y sin operaciones reales. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
execFileSync(process.execPath, [path.join(root, 'scripts/preparar-estatico.mjs')], { cwd: root, stdio: 'inherit' });
const output = path.join(root, 'frontend/public');
for (const file of ['demo.js', 'catalogo.json']) {
  fs.copyFileSync(path.join(root, 'docs/demo', file), path.join(output, file));
}
const index = path.join(output, 'index.html');
let html = fs.readFileSync(index, 'utf8');
html = html.replace('</head>', '<meta name="robots" content="noindex,nofollow"><script src="/demo.js"></script></head>');
html = html.replace('<title>By Jers | Cosmética y belleza</title>', '<title>By Jers | Demo de portafolio</title>');
fs.writeFileSync(index, html);
// Rutas físicas para hosts estáticos sin rewrites de SPA.
const { products } = JSON.parse(fs.readFileSync(path.join(output, 'catalogo.json'), 'utf8'));
const routes = ['tienda', 'bienvenida', 'estudio', 'looks', 'login', 'register', 'recuperar',
  'reset-password', 'carrito', 'checkout', 'contacto', 'admin', 'pedidos', 'perfil',
  'direcciones', 'mis-datos', 'mi-perfil', 'mis-direcciones',
  ...['maquillaje', 'cabello', 'rostro', 'ojos', 'labios', 'shampoo', 'acondicionador', 'tratamientos'].map(slug => `catalogo/${slug}`),
  ...products.map(product => `producto/${product._id}`)];
for (const route of routes) {
  const directory = path.join(output, route);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'index.html'), html);
}
fs.writeFileSync(path.join(output, '404.html'), html);
fs.writeFileSync(path.join(output, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
console.log('Demo preparada: solo lectura, sin backend, formularios ni pagos reales.');
