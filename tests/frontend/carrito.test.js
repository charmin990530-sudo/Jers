/**
 * @jest-environment jsdom
 *
 * Este archivo necesita DOM y `api.test.js` no: el primero usa jsdom porque el
 * módulo pinta en el panel, y el segundo lo evita a propósito, para comprobar que
 * `api.js` funciona en Node. El entorno va en el docblock de cada archivo en vez
 * de en la config común, que es justo por lo que no se puede poner `jsdom` como
 * `testEnvironment` por defecto.
 *
 * js/carrito.js — la lógica del carrito, que es donde vive el dinero que el
 * usuario cree que ha gastado.
 *
 * POR QUÉ ESTE ARCHIVO ES EL MÁS IMPORTANTE DE LA SUITE (B-05)
 * ------------------------------------------------------------
 * El módulo mantiene una lista en memoria, la fusiona con la del servidor al
 * iniciar sesión y la persiste en localStorage mientras el usuario es invitado.
 * Los fallos aquí no se ven como una excepción: se ven como un carrito que no
 * cuadra, y el usuario se sube al coche con una cantidad distinta de la que cree.
 *
 * Cubre dos cosas concretas:
 *
 *  1. **La defensa contra el envenenamiento del carrito.** `agregar()` rechaza un
 *     id que no sea un ObjectId de 24 hex, y `leerLocal()` descarta en lectura
 *     los items con id inválido. Sin eso, un item manipulado desde el navegador
 *     bloquea la fusión para siempre.
 *
 *  2. **El invariante de C-02.** El bug crítico de la auditoría fue que
 *     `carrito.js` emitía `class="carrito-item__img"` y **no existía ninguna
 *     regla con ese nombre** en las hojas CSS: la rejilla era `1fr auto auto`,
 *     así que el mínimo de una imagen sin ancho era su tamaño intrínseco y el
 *     botón de quitar caía fuera del panel. Aquí se comprueba que toda clase que
 *     el markup emite exista de verdad en el CSS, que es la raíz del problema.
 *
 * jsdom sí hace falta aquí (a diferencia de api.js): el módulo pinta en el DOM.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

/**
 * El DOM mínimo que el panel necesita. Sale del HTML real (index.html:325), con
 * los selectores que carrito.js consulta.
 */
const PANEL_HTML = `
  <div class="carrito-panel abierto" id="carritoPanel">
    <button class="carrito-cerrar" type="button">x</button>
    <ul class="carrito-lista"></ul>
    <div class="carrito-fondo"></div>
  </div>
  <button class="carrito-icono" type="button">carrito<span class="carrito-contador">0</span></button>
  <div class="carrito-resumen"><span class="carrito-total"></span></div>
  <a class="finalizar-pedido" href="/checkout"></a>
`;

const ID_VALIDO = '507f1f77bcf86cd799439011';
const CLAVE = 'jers_carrito';

/** Stub de `fetch`: el carrito de invitado no habla con la API al agregar. */
const responder = (cuerpo, status = 200) => {
  globalThis.fetch = jest.fn(async () => ({
    status,
    ok: status >= 200 && status < 300,
    headers: { get: () => null },
    json: async () => cuerpo,
  }));
};

let carrito;
let apiMock;

beforeEach(async () => {
  jest.resetModules();

  // El carrito llama a api.js; se sustituye para no tocar la red y para poder
  // observar qué se le pide. Se registra ANTES de importar carrito.js.
  apiMock = {
    getCart: jest.fn(async () => ({ ok: false, msg: 'sin sesión', data: { status: 401 } })),
    addToCart: jest.fn(async () => ({ ok: true, msg: '', data: { cart: { items: [] } } })),
    updateCartItem: jest.fn(async () => ({ ok: true, msg: '', data: { cart: { items: [] } } })),
    removeFromCart: jest.fn(async () => ({ ok: true, msg: '', data: { cart: { items: [] } } })),
    getMe: jest.fn(async () => ({ ok: false, msg: '', data: { status: 401 } })),
    alCambiarSesion: jest.fn(() => () => {}),
    obtenerUsuario: jest.fn(() => null),
  };
  jest.unstable_mockModule('../../js/api.js', () => apiMock);

  document.body.innerHTML = PANEL_HTML;
  localStorage.clear();
  responder({});
  carrito = await import('../../js/carrito.js');
});

afterEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  delete globalThis.fetch;
});

const enLocal = () => JSON.parse(localStorage.getItem(CLAVE) || '[]');

describe('carrito.js: defensa contra envenenamiento', () => {
  it('rechaza un id que no es un ObjectId de 24 hex', async () => {
    const r = await carrito.agregar({ id: 'no-es-un-id', nombre: 'X', precio: 1 });

    expect(r.ok).toBe(false);
    expect(r.motivo).toBe('Ese producto no se puede comprar.');
    expect(enLocal()).toEqual([]);
  });

  it('rechaza los Payment-attack: id con operadores de Mongo', async () => {
    // El caso que motiva la guarda: un id manipulado desde el navegador que
    // llega a la API y explota un operador en vez de consultar un documento.
    const r = await carrito.agregar({ id: '{"$ne": null}', nombre: 'X', precio: 1 });

    expect(r.ok).toBe(false);
    expect(enLocal()).toEqual([]);
  });

  it('descarta en lectura los items con id inválido que alguien inyectó en localStorage', async () => {
    // Se salta `agregar()` a propósito: esto simula al usuario que edita el
    // almacenamiento del navegador a mano.
    localStorage.setItem(CLAVE, JSON.stringify([
      { id: 'bueno', nombre: 'Producto bueno', precio: 100, cantidad: 1 },
      { id: '{"$ne":null}', nombre: 'Inyectado', precio: 1, cantidad: 1 },
      { nombre: 'Sin id', precio: 1, cantidad: 1 },
    ]));

    await carrito.sincronizar();

    // No se llama a la API con ninguno de los inyectados.
    const pedidos = apiMock.addToCart.mock.calls.map(c => c[0].productoId);
    expect(pedidos).not.toContain('{"$ne":null}');
    expect(pedidos).not.toContain(undefined);
  });
});

describe('carrito.js: cantidades y topes', () => {
  it('agrega un producto nuevo y lo persiste con la forma exacta', async () => {
    const r = await carrito.agregar({ id: ID_VALIDO, nombre: 'Labial', precio: 45900, cantidad: 2 });

    expect(r.ok).toBe(true);
    expect(enLocal()).toEqual([
      { id: ID_VALIDO, nombre: 'Labial', precio: 45900, cantidad: 2 },
    ]);
  });

  it('suma en vez de duplicar cuando el producto ya está en el carrito', async () => {
    await carrito.agregar({ id: ID_VALIDO, nombre: 'Labial', precio: 45900, cantidad: 2 });
    await carrito.agregar({ id: ID_VALIDO, nombre: 'Labial', precio: 45900, cantidad: 3 });

    const local = enLocal();
    expect(local).toHaveLength(1);
    expect(local[0].cantidad).toBe(5);
  });

  it('nunca pasa de MAX_POR_ITEM sumando el mismo producto', async () => {
    await carrito.agregar({ id: ID_VALIDO, nombre: 'Labial', precio: 1, cantidad: 90 });
    await carrito.agregar({ id: ID_VALIDO, nombre: 'Labial', precio: 1, cantidad: 90 });

    expect(enLocal()[0].cantidad).toBe(carrito.MAX_POR_ITEM);
  });

  it('recorta una cantidad entrante absurda al tope', async () => {
    await carrito.agregar({ id: ID_VALIDO, nombre: 'Labial', precio: 1, cantidad: 100000 });

    expect(enLocal()[0].cantidad).toBe(carrito.MAX_POR_ITEM);
  });

  it('una cantidad de 0 o negativa se trata como 1, no como 0', async () => {
    await carrito.agregar({ id: ID_VALIDO, nombre: 'Labial', precio: 1, cantidad: 0 });

    expect(enLocal()[0].cantidad).toBe(1);
  });

  it('un precio ilegible se guarda como 0 y no como NaN', async () => {
    await carrito.agregar({ id: ID_VALIDO, nombre: 'Labial', precio: 'gratis', cantidad: 1 });

    const [item] = enLocal();
    expect(item.precio).toBe(0);
    // NaN en un precio se propaga al total y se pinta "NaN" en la pantalla.
    expect(Number.isNaN(item.precio)).toBe(false);
  });
});

describe('carrito.js: el invariante que rompió C-02', () => {
  /**
   * C-02 fue esto: `carrito.js` emitía `class="carrito-item__img"` y no existía
   * ninguna regla con ese nombre en ninguna hoja de estilos. La rejilla era
   * `1fr auto auto`, así que el mínimo `auto` de una imagen sin ancho era su
   * tamaño intrínseco (900×1350 px) y el botón `×` quedaba fuera del panel de
   * 390 px. Se resolvió calculando el CSS; este test lo ata al comportamiento.
   */
  it('toda clase que el markup del item emite existe en el CSS', async () => {
    await carrito.agregar({ id: ID_VALIDO, nombre: 'Labial', precio: 45900, cantidad: 1 });

    // agregar() ya llama a pintar(), asi que el panel tiene el item.
    const html = document.querySelector('.carrito-lista').innerHTML;
    expect(html).toContain('carrito-item');

    const clases = [...html.matchAll(/class="([^"]+)"/g)]
      .flatMap(m => m[1].split(/\s+/))
      .filter(Boolean);

    expect(clases.length).toBeGreaterThan(0);

    // Se recorre TODO el CSS del sitio, no solo un archivo: la regla puede estar
    // en cualquiera, y lo que importa es que exista en algún sitio.
    const { readdirSync, readFileSync } = await import('node:fs');
    const hojas = readdirSync('css').filter(f => f.endsWith('.css'));
    const css = hojas.map(f => readFileSync(`css/${f}`, 'utf8')).join('\n');

    const huerfanas = clases.filter(c => !css.includes(`.${c}`));
    expect(huerfanas).toEqual([]);
  });

  it('la miniatura se emite con width y height, no solo con la clase', async () => {
    await carrito.agregar({
      id: ID_VALIDO,
      nombre: 'Labial',
      precio: 45900,
      cantidad: 1,
      imagen: '/img/productos/base-matte-lbel.webp',
    });

    const img = document.querySelector('.carrito-item__img');
    expect(img).not.toBeNull();
    // Los atributos son la segunda barrera: aunque la regla CSS se perdiera, el
    // navegador no puede estirar la miniatura más allá de 64 px.
    expect(img.getAttribute('width')).toBe('64');
    expect(img.getAttribute('height')).toBe('64');
  });

  it('una imagen que no sea ruta propia ni http(s) NO se pinta', async () => {
    // safeAssetUrl solo deja pasar rutas que empiezan por "/" (y no "//") o URLs
    // http/https. Una ruta relativa o un javascript: se descartan y cae el
    // placeholder, que es lo correcto: un src controlado por el usuario es XSS.
    // Un id distinto por caso: con el mismo, `agregar()` fusiona los tres en un
    // solo item y el test mediría uno en lugar de tres.
    const malas = [
      'javascript:alert(1)',
      '//evil.example/x.webp',
      'data:text/html,<script>alert(1)</script>',
    ];
    const ids = ['507f1f77bcf86cd799439013', '507f1f77bcf86cd799439014', '507f1f77bcf86cd799439015'];
    for (const [indice, mala] of malas.entries()) {
      await carrito.agregar({ id: ids[indice], nombre: `Mala ${indice}`, precio: 1, cantidad: 1, imagen: mala });
    }

    expect(document.querySelector('.carrito-item__img')).toBeNull();
    expect(document.querySelectorAll('.carrito-item__placeholder').length).toBe(malas.length);
  });

  it('un producto sin imagen deja el hueco, para que la fila no salte al pintar', async () => {
    await carrito.agregar({ id: ID_VALIDO, nombre: 'Sin foto', precio: 1000, cantidad: 1 });

    expect(document.querySelector('.carrito-item__placeholder')).not.toBeNull();
    expect(document.querySelector('.carrito-item__img')).toBeNull();
  });

  it('el botón de quitar está dentro del item, no fuera', async () => {
    await carrito.agregar({ id: ID_VALIDO, nombre: 'Labial', precio: 45900, cantidad: 1 });

    const item = document.querySelector('.carrito-item');
    expect(item.querySelector('.quitar-item')).not.toBeNull();
  });

  it('el nombre del producto se escapa al pintarlo', async () => {
    await carrito.agregar({
      id: ID_VALIDO,
      nombre: '<img src=x onerror="alert(1)">',
      precio: 1,
      cantidad: 1,
    });

    // El texto llega literal en el DOM: si se escapara mal, el elemento existiría.
    expect(document.querySelector('.carrito-item img[src="x"]')).toBeNull();
    expect(document.querySelector('.carrito-item__nombre').textContent).toContain('<img');
  });
});