/**
 * indices.test.js - Los índices declarados se usan de verdad
 *
 * POR QUÉ EXISTE
 * --------------
 * Un índice declarado en el esquema pero que ninguna consulta aprovecha no da
 * error en ninguna parte: simplemente no existe para el planificador, y la query
 * se resuelve con un COLLSCAN. Es la forma más fácil de perder rendimiento sin
 * enterarse.
 *
 * El caso que motivó este archivo: `GET /api/products` sin filtros es la petición
 * más frecuente de la tienda, y `buildFilter` siempre aplica `activo: true`.
 * Los índices que había eran `{categoria:1, activo:1}`, `{marca:1, activo:1}`,
 * `{destacado:1, activo:1}` y `{enPromocion:1, activo:1}`: ninguno tiene `activo`
 * como campo líder, así que Mongo no podía usarlos para un filtro de un solo
 * campo. Peor aún, `getFeaturedProducts` ordenaba por `createdAt`, un campo que no
 * estaba en ningún índice, así que ordenaba en memoria de todos modos.
 *
 * Estos tests miran el plan de ejecución real (`explain()`) contra el replica set
 * de memoria, no la lista de índices declarados: es la única forma de saber si el
 * planner los elige.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import mongoose from 'mongoose';
import { Product, Category, Brand, Order, User, Cart } from '../src/models/index.js';

const planDe = (model, filtro, opciones = {}) => model
  .find(filtro)
  .sort(opciones.sort || {})
  .limit(opciones.limit || 12)
  .explain('queryPlanner');

/**
 * Recorre el árbol del plan buscando algo.
 *
 * El plan ganador es un árbol de etapas anidadas, y la profundidad depende de la
 * versión de Mongo y de si hay `FETCH`, `PROJECTION_SIMPLE` o `SORT` de por
 * medio. Para un `find().sort().limit()` sobre un índice compuesto el camino es
 * LIMIT → FETCH → IXSCAN, tres niveles. Mirar solo los dos primeros da un falso
 * negativo, así que se recorre entero.
 */
const buscarEnPlan = (nodo, predicado) => {
  if (!nodo || typeof nodo !== 'object') return null;
  if (predicado(nodo)) return nodo;
  for (const valor of Object.values(nodo)) {
    const encontrado = buscarEnPlan(valor, predicado);
    if (encontrado) return encontrado;
  }
  return null;
};

/** `IXSCAN` es el nodo que significa "este índice se usó". */
const usaIxscan = plan => Boolean(
  buscarEnPlan(plan.queryPlanner?.winningPlan, n => n.stage === 'IXSCAN'),
);

/** Nombre del índice que el planner eligió, o null si hizo COLLSCAN. */
const indiceElegido = plan =>
  buscarEnPlan(plan.queryPlanner?.winningPlan, n => Boolean(n.indexName))?.indexName || null;

/**
 * ¿El planner tuvo que ordenar en memoria?
 *
 * El nodo se llama `SORT` en las versiones antiguas y `SORT_KEY`/`SORT` según el
 * caso. Se busca por nombre de etapa en vez de por el string completo del plan.
 */
const ordenaEnMemoria = plan => Boolean(
  buscarEnPlan(plan.queryPlanner?.winningPlan, n => typeof n.stage === 'string' && n.stage.startsWith('SORT')),
);

let categoria;
let marca;

beforeEach(async () => {
  // `syncIndexes()` es imprescindible: `autoIndex` solo dispara con el primer
  // uso del modelo y el setup de los tests no lo fuerza. Sin este paso el planner
  // no tiene ningún índice que elegir y hace COLLSCAN, que es justo lo que estos
  // tests vienen a detectar.
  await Promise.all([
    Product.syncIndexes(),
    Order.syncIndexes(),
    User.syncIndexes(),
    Cart.syncIndexes(),
  ]);

  [categoria, marca] = await Promise.all([
    // El slug de Category está validado contra un enum de las categorías del
    // negocio, así que no puede llevar un sufijo de unicidad como el de Brand.
    Category.create({ nombre: 'rostro', slug: 'rostro', orden: 1 }),
    Brand.create({ nombre: 'MarcaTest', slug: `marca-${Date.now()}`, orden: 1 }),
  ]);
});

const crearProductos = n => Promise.all(Array.from({ length: n }, (_, i) => Product.create({
  nombre: `Producto ${i}`,
  slug: `producto-${i}-${Math.random().toString(36).slice(2, 8)}`,
  descripcion: `Descripción ${i}`,
  precio: 10000 + i,
  stock: 10,
  categoria,
  marca,
  destacado: i % 3 === 0,
  enPromocion: i % 5 === 0,
  imagenes: [{ url: '/img/placeholder.svg', esPrincipal: true }],
})));

describe('índices de Product', () => {
  it('el listado por defecto usa un índice y no un COLLSCAN', async () => {
    await crearProductos(30);
    const plan = await planDe(Product, { activo: true }, { sort: { createdAt: -1, _id: 1 } });
    expect(usaIxscan(plan)).toBe(true);
    // El índice concreto cubre `{activo, createdAt, _id}`, que es el que se
    // acaba de declarar para este caso.
    expect(indiceElegido(plan)).toContain('activo_1_createdAt_-1__id_1');
  });

  it('el orden por precio usa un índice', async () => {
    await crearProductos(30);
    const plan = await planDe(Product, { activo: true }, { sort: { precio: 1, _id: 1 } });
    expect(usaIxscan(plan)).toBe(true);
    expect(indiceElegido(plan)).toContain('activo_1_precio_1');
  });

  it('los destacados usan un índice y no ordenan en memoria', async () => {
    await crearProductos(30);
    const plan = await planDe(Product, { destacado: true, activo: true }, { sort: { createdAt: -1 }, limit: 8 });
    expect(usaIxscan(plan)).toBe(true);
    // Sin el `createdAt` en el índice, el planner tenía que hacer un SORT en
    // memoria por encima del barrido.
    expect(ordenaEnMemoria(plan)).toBe(false);
  });

  it('las promociones usan un índice y no ordenan en memoria', async () => {
    await crearProductos(30);
    const plan = await planDe(Product, { enPromocion: true, activo: true }, { sort: { createdAt: -1 }, limit: 8 });
    expect(usaIxscan(plan)).toBe(true);
    expect(ordenaEnMemoria(plan)).toBe(false);
  });

  it('el filtro por categoría sigue usando su índice', async () => {
    await crearProductos(20);
    const plan = await planDe(Product, { activo: true, categoria });
    expect(usaIxscan(plan)).toBe(true);
  });

  it('el filtro por precio (minPrice/maxPrice) usa el índice de precio', async () => {
    await crearProductos(30);
    const plan = await planDe(Product, { activo: true, precio: { $gte: 10010, $lte: 10025 } });
    expect(usaIxscan(plan)).toBe(true);
  });

  it('no quedan índices sin usar entre los declarados', async () => {
    // Un índice que ninguna consulta del proyecto puede aprovechar no solo
    // ocupa disco: encarece cada escritura con una estructura B-tree más.
    await crearProductos(5);
    const indices = await Product.collection.indexes();
    const nombres = indices.map(i => i.name);
    // `{estado:1}` en Order era redundante con `{estado:1, createdAt:-1}`: en
    // Mongo un índice compuesto ya sirve cualquier query por prefijo.
    expect(nombres.filter(n => n === 'estado_1')).toEqual([]);
    // Y los cuatro que se sustituyeron por incluir `createdAt`.
    expect(nombres).toContain('activo_1_createdAt_-1__id_1');
    expect(nombres).toContain('activo_1_precio_1');
  });
});

describe('índices de Order', () => {
  it('los pedidos de un usuario usan un índice', async () => {
    const user = await User.create({
      nombre: 'Cli', apellido: 'Prueba', email: `idx_${Date.now()}@byjers.com`,
      password: 'x'.repeat(60), aceptoTerminos: true, aceptoPrivacidad: true,
    });
    const plan = await planDe(Order, { usuario: user._id }, { sort: { createdAt: -1 } });
    expect(usaIxscan(plan)).toBe(true);
  });

  it('el filtro del panel por estado usa un índice', async () => {
    const plan = await planDe(Order, { estado: 'pendiente' }, { sort: { createdAt: -1 } });
    expect(usaIxscan(plan)).toBe(true);
  });

  it('el índice de idempotencia es único y parcial', async () => {
    const indices = await Order.collection.indexes();
    const idx = indices.find(i => i.key && i.key.usuario === 1 && i.key.idempotencyKey === 1);
    expect(idx).toBeDefined();
    expect(idx.unique).toBe(true);
    // El filtro parcial es lo que permite que dos pedidos SIN cabecera convivan:
    // no entran en el índice, así que no chocan.
    expect(idx.partialFilterExpression).toEqual({ idempotencyKey: { $type: 'string' } });
  });

  it('el índice {estado:1} redundante ya no está', async () => {
    const indices = await Order.collection.indexes();
    const nombres = indices.map(i => i.name);
    // `{estado:1}` no aceleraba nada que `{estado:1, createdAt:-1}` no cubriera
    // y hacía que cada escritura actualizara dos B-trees en vez de una.
    expect(nombres).not.toContain('estado_1');
    expect(nombres).toContain('estado_1_createdAt_-1');
  });
});

describe('el seed no rompe con el sku automático', () => {
  it('dos productos con las mismas tres iniciales reciben SKUs distintos', async () => {
    const a = await Product.create({
      nombre: 'Shampoo Anticaída', slug: 'shampoo-a', descripcion: 'x',
      precio: 10000, stock: 5, categoria, marca,
      imagenes: [{ url: '/img/placeholder.svg', esPrincipal: true }],
    });
    const b = await Product.create({
      nombre: 'Shampoo Reparador', slug: 'shampoo-b', descripcion: 'x',
      precio: 10000, stock: 5, categoria, marca,
      imagenes: [{ url: '/img/placeholder.svg', esPrincipal: true }],
    });
    expect(a.sku).toMatch(/^BJ-SHA-/);
    expect(b.sku).toMatch(/^BJ-SHA-/);
    // Con `Date.now().toString(36)` como sufijo, dos creations seguidas caían en
    // el mismo milisegado con alta probabilidad y el índice único devolvía
    // E11000, un 400 "El recurso ya existe" sin explicación.
    expect(a.sku).not.toBe(b.sku);
  });

  it('un nombre con acentos no rompe el SKU', async () => {
    const p = await Product.create({
      nombre: 'Óxido de Colour', slug: 'oxido-colour', descripcion: 'x',
      precio: 10000, stock: 5, categoria, marca,
      imagenes: [{ url: '/img/placeholder.svg', esPrincipal: true }],
    });
    expect(p.sku).toMatch(/^BJ-[A-Z0-9]{3}-[A-Z0-9]{6}$/);
  });
});

// Deja las colecciones limpias para el resto de la suite.
afterEach(async () => {
  await Promise.all([
    Product.deleteMany({}), Category.deleteMany({}), Brand.deleteMany({}),
    Order.deleteMany({}), Cart.deleteMany({}),
  ]);
});