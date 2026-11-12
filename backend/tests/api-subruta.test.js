/**
 * api/validar-subruta.js — B-33.
 *
 * El shim de Vercel reconstruye `req.url` con la subruta de `req.query.path`, que
 * llegaba sin validar. La auditoría verificó que no hay bypass, pero sí un
 * contrato roto: `/api/foo/../admin` no salta la guarda de `%2f` de security.js
 * (la URL ya viene reescrita) y `path-to-regexp` lo trata como literal, así que el
 * resultado era un 404 — el de "no existe" — en lugar de un 400, que es el de
 * "has pedido algo que no tiene sentido".
 *
 * El patrón está en modo estricto a propósito: si mañana se añade una ruta con un
 * guion doble o con un punto en el slug, este test falla y obliga a decidir si se
 * ensancha el patrón a propósito. Prefiere romperse a dejar pasar lo que no debe.
 */
import { describe, it, expect } from '@jest/globals';
import { validarSubruta, patronSubruta, INVALID_API_PATH } from '../src/utils/validar-subruta.js';

describe('validar-subruta: rutas que existen de verdad', () => {
  // Las tres formas que monta backend/src/app.js: un prefijo suelto, un id de
  // Mongo, y el caso mas largo que hay (admin/categorias/:id/check-products).
  const validas = [
    'health',
    'auth/login',
    'auth/reset-password',
    'products/507f1f77bcf86cd799439011',
    'cart',
    'orders/507f1f77bcf86cd799439011/cancelar',
    'admin/productos/507f1f77bcf86cd799439011',
    'admin/categorias/507f1f77bcf86cd799439011/check-products',
    'users/me',
    'contact',
    'csp-report',
  ];

  it.each(validas)('%s se acepta', subruta => {
    const r = validarSubruta(subruta);
    expect(r.ok).toBe(true);
    expect(r.ruta).toBe(`/api/${subruta}`);
  });
});

describe('validar-subruta: rutas que no deben pasar', () => {
  const invalidas = [
    ['travesía de directorio', 'foo/../admin'],
    ['travesía al principio', '../admin'],
    ['punto suelto', '.'],
    ['dos puntos', '..'],
    ['archivo oculto', '.env'],
    ['barra duplicada', 'foo//bar'],
    ['barra inicial', '/admin'],
    ['barra final', 'admin/'],
    ['demasiados segmentos', 'a/b/c/d/e/f'],
    ['punto y coma', 'auth/login;drop'],
    ['espacio', 'auth/ login'],
    ['barra invertida', 'auth\\login'],
    ['arroba', 'auth@evil.example'],
    ['interrogacion inyectada', 'auth?redirect=http://evil.example'],
    ['nulo', 'auth%00login'],
    ['html', '<script>'],
    ['vacio', ''],
  ];

  it.each(invalidas)('%s -> se rechaza', (_nombre, subruta) => {
    const r = validarSubruta(subruta);
    expect(r.ok).toBe(false);
    expect(r.mensaje).toContain('Ruta de API no válida');
  });

  it('el mensaje dice cuántos segmentos se admiten, para que el error sea accionable', () => {
    const { mensaje } = validarSubruta('a/b/c/d/e');
    expect(mensaje).toContain('4');
  });

  it('el codigo de error es propio y no se confunde con uno de auth', () => {
    expect(INVALID_API_PATH).toBe('INVALID_API_PATH');
  });
});

describe('validar-subruta: el patron por dentro', () => {
  it('no acepta una subruta vacia, que es lo que pasa si path llega como []', () => {
    expect(patronSubruta.test('')).toBe(false);
  });

  it('es case-insensitive en la practica: acepta mayusculas, y Express no distingue', () => {
    expect(patronSubruta.test('HEALTH')).toBe(true);
  });

  it('admite guion y guion bajo, que es lo que usan los prefijos reales', () => {
    expect(patronSubruta.test('mis-pedidos')).toBe(true);
    expect(patronSubruta.test('mis_pedidos')).toBe(true);
  });
});
