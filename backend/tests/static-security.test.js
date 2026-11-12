import { expect, test } from '@jest/globals';
import { isPrivateStaticPath } from '../src/middleware/staticSecurity.js';

test.each(['/.env', '/nested/.env', '/%2eenv', '/nested/%2econfig/keys.json', '/node_modules/package/index.js', '/package.json', '/package%2ejson', '/package-lock.json', '/assets/key.pem', '/frontend/src/main.js.map', '/tsconfig.app.json', '/README.md', '/%ZZ'])('protege una ruta privada o malformada: %s', path => {
  expect(isPrivateStaticPath(path)).toBe(true);
});
test.each(['/img/productos/labial.webp', '/video/jers-store-entry-v1.mp4', '/main-A1B2.js', '/styles-A1B2.css', '/media/font.woff2', '/index.html', '/robots.txt', '/sitemap.xml'])('mantiene disponible el recurso público: %s', path => {
  expect(isPrivateStaticPath(path)).toBe(false);
});
