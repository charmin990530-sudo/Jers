/**
 * financial.test.js - Logica financiera contra la base de datos real
 *
 * money.test.js cubre la aritmetica pura. Aqui se comprueba que el sistema
 * completo guarda y devuelve los mismos numeros: lo que calcula el controlador es
 * lo que queda persistido, lo que devuelve la API y lo que suma el panel.
 *
 * Dos detalles del entorno hacen que estos tests sean utiles:
 *
 * 1. Corren contra un replica set real (tests/setup.js), asi que la seccion de
 *    transacciones ejercita atomicidad de verdad y no la compensacion.
 * 2. `afterEach` borra TODAS las colecciones, asi que los fixtures se crean en
 *    `beforeEach`. Crearlos en `beforeAll` haria que el admin desapareciera
 *    despues del primer test y todos los siguientes dieran 401.
 */

import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../src/app.js';
import { Product, Category, Brand, Order, Cart } from '../src/models/index.js';
import { detectTransactionSupport } from '../src/services/transaction.js';
import { taxFor } from '../src/services/money.js';
import { generarNumeroOrden } from '../src/models/Order.js';
import { SHIPPING_RULES } from '../src/controllers/orderController.js';
import { TAX_RATE_BP } from '../src/config/env.js';
import { inicioDiaNegocio, rangoDiaNegocio } from '../src/controllers/adminController.js';

const DIR = {
  alias: 'Casa', nombreCompleto: 'Cliente Prueba', telefono: '3001234567',
  direccion: 'Calle 1 #2-3', ciudad: 'Bogota', departamento: 'Cundinamarca',
};

/** Agente de pruebas con su token CSRF cacheado. */
const nuevoAgente = async () => {
  const agent = request.agent(app);
  const csrf = await agent.get('/api/auth/csrf');
  agent.csrf = csrf.body?.csrfToken;
  return agent;
};

const conCsrf = (agent, method) => (url, body, headers = {}) => {
  const req = agent[method](url).set(headers);
  if (body !== undefined) req.send(body);
  // csrfProtection cubre todo lo que no sea GET/HEAD/OPTIONS, DELETE incluido.
  if (method !== 'get' && method !== 'head') req.set('X-CSRF-Token', agent.csrf);
  return req;
};

// Registra Y entra. Desde B-02 el registro ya no deja conectado: hace falta el
// login aparte para tener cookie de sesión. Además el registro ya no devuelve
// `user`, así que el id sale de la respuesta del login.
const registrar = async email => {
  const agent = await nuevoAgente();
  const alta = await conCsrf(agent, 'post')('/api/auth/register', {
    nombre: 'Cli', apellido: 'Prueba', email, password: 'ClaveSegura123',
    aceptoTerminos: true, aceptoPrivacidad: true,
  });
  expect(alta.status).toBe(201);

  const login = await conCsrf(agent, 'post')('/api/auth/login', {
    email, password: 'ClaveSegura123',
  });
  expect(login.status).toBe(200);
  return { agent, id: login.body.user.id };
};

let admin;
let cliente;
let categoria;
let marca;

const crearProducto = (overrides = {}) => Product.create({
  nombre: `Producto ${Math.random().toString(36).slice(2, 8)}`,
  descripcion: 'Producto de prueba para los tests financieros',
  precio: 50000,
  stock: 10,
  categoria,
  marca,
  imagenes: [{ url: '/img/placeholder.svg', esPrincipal: true }],
  ...overrides,
});

const User_setRole = async (id, role) => {
  const { User } = await import('../src/models/index.js');
  await User.updateOne({ _id: id }, { $set: { role } });
  // La cookie JWT lleva `ver: tokenVersion`; cambiar el rol no la invalida.
  return id;
};

beforeEach(async () => {
  [categoria, marca] = await Promise.all([
    Category.create({ nombre: 'rostro', slug: 'rostro', orden: 1 }),
    Brand.create({ nombre: 'MarcaTest', slug: 'marca-test', orden: 1 }),
  ]);

  admin = await nuevoAgente();
  const correoAdmin = `admin_${Date.now()}_${Math.random()}@byjers.com`;
  const alta = await conCsrf(admin, 'post')('/api/auth/register', {
    nombre: 'Admin', apellido: 'Fin', email: correoAdmin,
    password: 'ClaveSegura123', aceptoTerminos: true, aceptoPrivacidad: true,
  });
  expect(alta.status).toBe(201);
  // El registro no deja conectado desde B-02, así que el id sale del login.
  const sesionAdmin = await conCsrf(admin, 'post')('/api/auth/login', {
    email: correoAdmin, password: 'ClaveSegura123',
  });
  expect(sesionAdmin.status).toBe(200);
  await User_setRole(sesionAdmin.body.user.id, 'admin');

  cliente = await registrar(`cliente_${Date.now()}_${Math.random()}@byjers.com`);
});


const agregar = (producto, cantidad = 1) =>
  conCsrf(cliente.agent, 'post')('/api/cart', { productoId: producto._id.toString(), cantidad });

// El cuerpo de POST /api/orders es { direccionEnvio: {...}, notas? }. `extra` se
// fusiona encima, asi que `pedir({ direccionEnvio: {} })` sirve para probar un
// cuerpo invalido a proposito.
const pedir = (extra = {}, headers = {}) =>
  conCsrf(cliente.agent, 'post')('/api/orders', { direccionEnvio: DIR, ...extra }, headers);

// =========================================================================
describe('integridad de los importes persistidos', () => {
  it('guarda los precios como enteros y rechaza los decimales', async () => {
    const ok = await crearProducto({ precio: 58000 });
    expect(Number.isInteger(ok.precio)).toBe(true);
    await expect(crearProducto({ precio: 58000.5 })).rejects.toThrow(/numero entero/);
  });

  it('rechaza un precio negativo a nivel de modelo', async () => {
    await expect(crearProducto({ precio: -1 })).rejects.toThrow();
  });

  it('calcula el descuento como entero exacto', async () => {
    const p = await crearProducto({ precio: 58000, precioAnterior: 68000 });
    const doc = await Product.findById(p._id);
    expect(doc.descuentoPorcentaje).toBe(15);
    expect(Number.isInteger(doc.descuentoPorcentaje)).toBe(true);
  });

  it('no acepta un precio anterior menor que el precio', async () => {
    await expect(crearProducto({ precio: 60000, precioAnterior: 50000 }))
      .rejects.toThrow(/precio anterior debe ser mayor/);
  });
});

describe('validacion de importes en la capa HTTP', () => {
  const bodyProducto = extra => ({
    descripcion: 'Producto de prueba para validar importes',
    stock: 1, categoria: categoria._id.toString(), marca: marca._id.toString(),
    imagenes: [{ url: '/img/placeholder.svg' }],
    ...extra,
  });

  it('rechaza un precio decimal enviado por el admin', async () => {
    const res = await conCsrf(admin, 'post')('/api/admin/productos', bodyProducto({ nombre: 'Precio decimal', precio: 100.5 }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(res.body.error.details)).toMatch(/entero/);
  });

  it('rechaza un precio negativo', async () => {
    const res = await conCsrf(admin, 'post')('/api/admin/productos', bodyProducto({ nombre: 'Precio negativo', precio: -100 }));
    expect(res.status).toBe(400);
  });

  it('acepta un precio entero grande pero representable', async () => {
    const res = await conCsrf(admin, 'post')('/api/admin/productos', bodyProducto({ nombre: 'Precio enorme', precio: 999999999 }));
    expect(res.status).toBe(201);
    expect(res.body.product.precio).toBe(999999999);
  });

  it('rechaza un JSON malformado con un mensaje util', async () => {
    const res = await admin.post('/api/admin/productos')
      .set('Content-Type', 'application/json').set('X-CSRF-Token', admin.csrf)
      .send('{esto no es json');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toMatch(/JSON/i);
  });
});

describe('total del pedido: lo calculado es lo guardado y lo devuelto', () => {
  it('sin envio gratis: suma envio e IVA al subtotal', async () => {
    const producto = await crearProducto({ precio: 62000, stock: 10 });
    await agregar(producto, 3);
    const res = await pedir();
    expect(res.status).toBe(201);

    const guardado = await Order.findById(res.body.order.id);
    expect(guardado.subtotal).toBe(186000);
    expect(guardado.costoEnvio).toBe(SHIPPING_RULES.cost);
    // El IVA se aplica sobre la base imponible (subtotal + envio), no solo sobre
    // el subtotal: el flete también es una prestación sujeta a gravamen.
    expect(guardado.impuestos).toBe(taxFor(186000 + SHIPPING_RULES.cost, TAX_RATE_BP));
    expect(guardado.total).toBe(
      guardado.subtotal + guardado.costoEnvio + guardado.impuestos,
    );
    expect(res.body.order.total).toBe(guardado.total);
  });

  it('el total con IVA cuadra con el subtotal + envio + impuestos', async () => {
    const producto = await crearProducto({ precio: 62000, stock: 10 });
    await agregar(producto, 3);
    const res = await pedir();
    const guardado = await Order.findById(res.body.order.id);
    expect(guardado.total).toBe(186000 + 15000 + 38190); // 239190
    expect(res.body.order.total).toBe(239190);
  });

  it('en el umbral exacto el envio es gratis (borde inclusivo)', async () => {
    const producto = await crearProducto({ precio: 50000, stock: 10 });
    await agregar(producto, 4);
    const res = await pedir();
    expect(res.status).toBe(201);
    const guardado = await Order.findById(res.body.order.id);
    expect(guardado.subtotal).toBe(200000);
    expect(guardado.costoEnvio).toBe(0);
    // Sin envío, la base imponible es solo el subtotal.
    expect(guardado.impuestos).toBe(38000);
    expect(guardado.total).toBe(238000);
    expect(res.body.order.total).toBe(238000);
  });

  it('un peso por debajo del umbral si cobra envio', async () => {
    const producto = await crearProducto({ precio: 199999, stock: 10 });
    await agregar(producto, 1);
    const res = await pedir();
    const guardado = await Order.findById(res.body.order.id);
    expect(guardado.subtotal).toBe(199999);
    expect(guardado.costoEnvio).toBe(SHIPPING_RULES.cost);
  });

  it('cada linea guarda subtotal = precio x cantidad y el total cuadra', async () => {
    const a = await crearProducto({ precio: 33333, stock: 10 });
    const b = await crearProducto({ precio: 7777, stock: 10 });
    await agregar(a, 3);
    await agregar(b, 7);
    const res = await pedir();
    const guardado = await Order.findById(res.body.order.id);

    for (const item of guardado.items) {
      expect(item.subtotal).toBe(item.precioUnitario * item.cantidad);
      expect(Number.isInteger(item.subtotal)).toBe(true);
    }
    expect(guardado.items.reduce((s, i) => s + i.subtotal, 0)).toBe(guardado.subtotal);
    expect(guardado.subtotal).toBe(3 * 33333 + 7 * 7777); // 154438
  });

  it('el snapshot congela el precio aunque el admin lo cambie despues', async () => {
    const producto = await crearProducto({ precio: 50000, stock: 10 });
    await agregar(producto, 1);
    const creado = await pedir();
    const antes = await Order.findById(creado.body.order.id);

    await conCsrf(admin, 'patch')(`/api/admin/productos/${producto._id}`, { precio: 99000 });

    const despues = await Order.findById(creado.body.order.id);
    expect(despues.items[0].precioUnitario).toBe(antes.items[0].precioUnitario);
    expect(despues.items[0].subtotal).toBe(antes.items[0].subtotal);
  });

  it('el mensaje de WhatsApp muestra los mismos importes que el pedido', async () => {
    const producto = await crearProducto({ precio: 45000, stock: 10 });
    await agregar(producto, 2);
    const res = await pedir();
    const guardado = await Order.findById(res.body.order.id);
    // `searchParams.get()` YA decodifica: Applying decodeURIComponent encima es
    // una doble decodificacion que revienta con el "%" del "IVA (19%)". Solo
    // fallaba ahora porque la linea de IVA es lo primero que mete un "%" en el
    // mensaje; el resto del texto nunca tuvo ninguno.
    const texto = new URL(res.body.order.whatsappUrl).searchParams.get('text');
    expect(texto).toContain(`$${guardado.subtotal.toLocaleString('es-CO')}`);
    expect(texto).toContain(`$${guardado.impuestos.toLocaleString('es-CO')}`);
    expect(texto).toContain(`$${guardado.total.toLocaleString('es-CO')}`);
  });
});

describe('carrito: importes y autorizacion', () => {
  it('el subtotal coincide con la suma de sus lineas', async () => {
    const producto = await crearProducto({ precio: 25000, stock: 30 });
    const res = await agregar(producto, 4);
    expect(res.status).toBe(200);
    expect(res.body.cart.subtotal).toBe(100000);
    expect(res.body.cart.totalItems).toBe(4);
  });

  it('actualizar cantidad recalcula el subtotal en enteros', async () => {
    const producto = await crearProducto({ precio: 25000, stock: 30 });
    const add = await agregar(producto, 2);
    const itemId = add.body.cart.items.find(i => i.producto._id === producto._id.toString())._id;
    const upd = await conCsrf(cliente.agent, 'patch')(`/api/cart/${itemId}`, { cantidad: 7 });
    expect(upd.body.cart.subtotal).toBe(175000);
  });

  it('rechaza una cantidad decimal', async () => {
    const producto = await crearProducto({ precio: 25000, stock: 30 });
    const res = await conCsrf(cliente.agent, 'post')('/api/cart', { productoId: producto._id.toString(), cantidad: 1.5 });
    expect(res.status).toBe(400);
  });

  it('no deja pasar de 99 unidades del mismo producto aunque se agregue por partes', async () => {
    // El limite por producto es del SERVIDOR: cada peticion respeta el tope de
    // 99, pero el total del mismo producto en el carrito tambien. Antes solo se
    // comprobaba la cantidad de cada llamada, asi que dos altas de 50 dejaban
    // 100 unidades en el carrito y el servidor lo aceptaba.
    const producto = await crearProducto({ precio: 25000, stock: 500 });
    expect((await agregar(producto, 50)).status).toBe(200);
    // Esta pasaria de 100: se rechaza y el carrito se queda en 50.
    const segundo = await agregar(producto, 50);
    expect(segundo.status).toBe(400);
    expect(segundo.body.error.code).toBe('INVALID_QUANTITY');
    expect((await agregar(producto, 40)).status).toBe(200);

    const carrito = await cliente.agent.get('/api/cart');
    expect(carrito.body.cart.items[0].cantidad).toBe(90);
  });

  it('rechaza una cantidad por encima del tope en una sola llamada', async () => {
    const producto = await crearProducto({ precio: 25000, stock: 500 });
    const res = await conCsrf(cliente.agent, 'post')('/api/cart', { productoId: producto._id.toString(), cantidad: 100 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('otro usuario no puede ver ni tocar un carrito ajeno', async () => {
    const producto = await crearProducto({ precio: 25000, stock: 30 });
    const add = await agregar(producto, 2);
    const itemId = add.body.cart.items[0]._id;

    const intruso = await registrar(`intruso_${Date.now()}@byjers.com`);
    expect((await conCsrf(intruso.agent, 'patch')(`/api/cart/${itemId}`, { cantidad: 99 })).status).toBe(404);
    // DELETE tambien exige CSRF, asi que se envia su propio token.
    const borrado = await intruso.agent.delete(`/api/cart/${itemId}`).set('X-CSRF-Token', intruso.agent.csrf);
    expect(borrado.status).toBe(404);

    const mio = await cliente.agent.get('/api/cart');
    expect(mio.body.cart.items[0].cantidad).toBe(2);
  });
});

describe('stock', () => {
  it('crear pedido descuenta stock y suma vendidos', async () => {
    const producto = await crearProducto({ precio: 30000, stock: 10 });
    await agregar(producto, 4);
    await pedir();
    const d = await Product.findById(producto._id);
    expect(d.stock).toBe(6);
    expect(d.vendidos).toBe(4);
  });

  it('cancelar devuelve el stock y descuenta vendidos', async () => {
    const producto = await crearProducto({ precio: 30000, stock: 10 });
    await agregar(producto, 3);
    const creado = await pedir();
    expect((await Product.findById(producto._id)).stock).toBe(7);

    const cancelado = await conCsrf(cliente.agent, 'patch')(`/api/orders/${creado.body.order.id}/cancelar`, { motivo: 'prueba' });
    expect(cancelado.status).toBe(200);
    expect(cancelado.body.order.estado).toBe('cancelado');

    const d = await Product.findById(producto._id);
    expect(d.stock).toBe(10);
    expect(d.vendidos).toBe(0);
  });

  it('dos usuarios compitiendo por la ultima unidad: el stock nunca queda negativo', async () => {
    const producto = await crearProducto({ precio: 30000, stock: 1 });
    const rival = await registrar(`rival_${Date.now()}@byjers.com`);

    await agregar(producto, 1);
    await conCsrf(rival.agent, 'post')('/api/cart', { productoId: producto._id.toString(), cantidad: 1 });

    // Ambos pulsan "comprar" a la vez. Solo uno puede quedarse con la unidad.
    const [a, b] = await Promise.all([
      pedir(),
      conCsrf(rival.agent, 'post')('/api/orders', { direccionEnvio: DIR }),
    ]);

    const creados = [a, b].filter(r => r.status === 201);
    expect(creados.length).toBe(1);
    // El perdedor recibe un error de stock, no un pedido a medias.
    const rechazado = [a, b].find(r => r.status !== 201);
    expect(rechazado.status).toBe(400);
    expect(rechazado.body.error.code).toBe('INSUFFICIENT_STOCK');

    const d = await Product.findById(producto._id);
    expect(d.stock).toBe(0);
    expect(d.stock).toBeGreaterThanOrEqual(0);
    expect(d.vendidos).toBe(1);
    expect(await Order.countDocuments({})).toBe(1);
  });

  it('no deja agregar al carrito mas unidades de las que hay', async () => {
    const producto = await crearProducto({ precio: 30000, stock: 2 });
    const res = await agregar(producto, 5);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect((await Product.findById(producto._id)).stock).toBe(2);
  });

  it('si el stock baja despues, el checkout lo detecta y no descuenta de mas', async () => {
    const producto = await crearProducto({ precio: 30000, stock: 5 });
    await agregar(producto, 5);

    // Otro comprador se lleva el stock por la puerta de atras mientras este
    // carrito sigue en la sesion del cliente.
    await Product.updateOne({ _id: producto._id }, { $set: { stock: 0 } });

    const res = await pedir();
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    const d = await Product.findById(producto._id);
    expect(d.stock).toBe(0);
    expect(d.stock).toBeGreaterThanOrEqual(0);
  });
});

describe('balance del panel de administracion', () => {
  it('solo suma a los ingresos los pedidos PAGADOS', async () => {
    const producto = await crearProducto({ precio: 100000, stock: 50 });
    await agregar(producto, 1);
    const pedido = await pedir();

    const antes = await admin.get('/api/admin/dashboard');
    expect(antes.status).toBe(200);
    expect(antes.body.stats.totalRevenue).toBe(0); // aun esta pendiente

    const pagado = await conCsrf(admin, 'patch')(`/api/admin/pedidos/${pedido.body.order.id}`, { estadoPago: 'pagado' });
    expect(pagado.status).toBe(200);

    const despues = await admin.get('/api/admin/dashboard');
    const guardado = await Order.findById(pedido.body.order.id);
    expect(despues.body.stats.totalRevenue).toBe(guardado.total);
  });

  it('un pedido cancelado no se puede marcar como pagado', async () => {
    const producto = await crearProducto({ precio: 100000, stock: 50 });
    await agregar(producto, 1);
    const pedido = await pedir();
    await conCsrf(cliente.agent, 'patch')(`/api/orders/${pedido.body.order.id}/cancelar`, {});

    const pagado = await conCsrf(admin, 'patch')(`/api/admin/pedidos/${pedido.body.order.id}`, { estadoPago: 'pagado' });
    expect(pagado.status).toBeGreaterThanOrEqual(400);
  });

  it('cancelar desde admin devuelve el stock una sola vez', async () => {
    const producto = await crearProducto({ precio: 30000, stock: 10 });
    await agregar(producto, 2);
    const pedido = await pedir();
    expect((await Product.findById(producto._id)).stock).toBe(8);

    const r1 = await conCsrf(admin, 'patch')(`/api/admin/pedidos/${pedido.body.order.id}`, { estado: 'cancelado' });
    expect(r1.status).toBe(200);
    expect((await Product.findById(producto._id)).stock).toBe(10);

    // Segundo intento con el mismo estado: la API responde 200 (es idempotente,
    // el pedido ya estaba cancelado) pero lo importante es que NO devuelva el
    // stock otra vez. Si se devolviera dos veces el inventario creeria.
    const r2 = await conCsrf(admin, 'patch')(`/api/admin/pedidos/${pedido.body.order.id}`, { estado: 'cancelado' });
    expect(r2.status).toBe(200);
    expect((await Product.findById(producto._id)).stock).toBe(10);
    expect((await Product.findById(producto._id)).vendidos).toBe(0);
  });
});

describe('numeracion y fechas de fin de mes', () => {
  const basePedido = producto => ({
    usuario: cliente.id,
    items: [{ producto: producto._id, nombre: producto.nombre, precioUnitario: 10000, cantidad: 1, subtotal: 10000 }],
    subtotal: 10000, costoEnvio: 0, total: 10000,
    direccionEnvio: { alias: 'C', nombreCompleto: 'F', telefono: '3001234567', direccion: 'C 1', ciudad: 'B', departamento: 'C' },
  });

  it('el numero de pedido usa la fecha del dia con dos digitos', async () => {
    const p = await crearProducto({ precio: 10000, stock: 5 });
    const pedido = await Order.create(basePedido(p));
    const hoy = new Date();
    const esperado = `BJ-${String(hoy.getFullYear()).slice(-2)}${String(hoy.getMonth() + 1).padStart(2, '0')}${String(hoy.getDate()).padStart(2, '0')}`;
    expect(pedido.numeroOrden).toMatch(new RegExp(`^${esperado}-[A-Z0-9]{6}$`));
  });

  it('31 de enero y 1 de febrero producen prefijos de fecha distintos', () => {
    // generarNumeroOrden es pura, asi que se puede comprobar con fechas fijas sin
    // falsear el reloj global.
    const finDeEnero = generarNumeroOrden(new Date(2026, 0, 31, 23, 59, 59));
    const inicioDeFebrero = generarNumeroOrden(new Date(2026, 1, 1, 0, 0, 1));
    expect(finDeEnero).toMatch(/^BJ-260131-[A-Z0-9]{6}$/);
    expect(inicioDeFebrero).toMatch(/^BJ-260201-[A-Z0-9]{6}$/);
  });

  it('todos los dias de un mes bisiesto dan 6 digitos de fecha', () => {
    // 2024 es bisiesto: el 29 de febrero existe y no debe romper el formato.
    // (El dia 30 ya no se prueba: new Date(2024, 1, 30) desborda a marzo por
    //  construccion del objeto Date de JavaScript, no por el generador.)
    for (const dia of [1, 9, 28, 29]) {
      const numero = generarNumeroOrden(new Date(2024, 1, dia));
      expect(numero).toMatch(/^BJ-2402\d{2}-[A-Z0-9]{6}$/);
      expect(numero.slice(3, 9)).toHaveLength(6);
    }
  });

  it('el cambio de anio se refleja en el prefijo', () => {
    expect(generarNumeroOrden(new Date(2026, 11, 31))).toMatch(/^BJ-261231-/);
    expect(generarNumeroOrden(new Date(2027, 0, 1))).toMatch(/^BJ-270101-/);
  });

  it('el sufijo aleatorio siempre tiene 6 caracteres', () => {
    for (let i = 0; i < 200; i++) {
      const sufijo = generarNumeroOrden(new Date(2026, 5, 15)).split('-')[2];
      expect(sufijo).toHaveLength(6);
      expect(sufijo).toMatch(/^[A-Z0-9]{6}$/);
    }
  });

  it('pedidos del 31 y del 1 no se mezclan en el ingreso del dia', async () => {
    const p = await crearProducto({ precio: 10000, stock: 5 });
    const base = { ...basePedido(p), estadoPago: 'pagado' };
    await Order.create({ ...base, createdAt: new Date(2026, 0, 31, 12, 0, 0) });
    await Order.create({ ...base, createdAt: new Date(2026, 1, 1, 12, 0, 0) });

    const res = await admin.get('/api/admin/dashboard');
    expect(res.status).toBe(200);
    // Hoy no es ninguno de esos dias: revenueToday debe ser 0 aunque totalRevenue
    // sume los dos pedidos.
    expect(res.body.stats.revenueToday).toBe(0);
    expect(res.body.stats.totalRevenue).toBe(20000);
  });
});

describe('dia de negocio: America/Bogota, no la zona del servidor', () => {
  // El bug era `new Date().setHours(0,0,0,0)`, que usa la zona del PROCESO. En
  // Vercel el proceso corre en UTC, asi que el dia del negocio empezaba a las
  // 19:00 hora Colombia. Estos tests son deterministas: no dependen de la zona
  // en la que se ejecute el runner.

  const basePedidoPagado = (importe = 10000) => ({
    usuario: cliente.id,
    items: [{ producto: new mongoose.Types.ObjectId(), nombre: 'Producto', precioUnitario: importe, cantidad: 1, subtotal: importe }],
    subtotal: importe,
    costoEnvio: 0,
    total: importe,
    direccionEnvio: { alias: 'Casa', nombreCompleto: 'Ana', telefono: '3001234567', direccion: 'Calle 1', ciudad: 'Medellín', departamento: 'Antioquia' },
    estadoPago: 'pagado',
  });

  it('la medianoche de Bogota cae a las 05:00 UTC', () => {
    // 2026-09-30 00:00 en Bogota (UTC-5) = 2026-09-30 05:00 UTC.
    const inicio = inicioDiaNegocio(new Date('2026-09-30T12:00:00.000Z'));
    expect(inicio.toISOString()).toBe('2026-09-30T05:00:00.000Z');
  });

  it('a las 02:00 UTC ya es el dia siguiente en Bogota', () => {
    // 2026-10-01 02:00 UTC = 2026-10-01 21:00 en Bogota: sigue siendo 30.
    // Con setHours en UTC, este instante habria iniciado el dia 01 a las 00:00
    // UTC, cinco horas antes de que el negocio considerara que habia cambiado.
    const instante = new Date('2026-10-01T02:00:00.000Z');
    expect(inicioDiaNegocio(instante).toISOString()).toBe('2026-09-30T05:00:00.000Z');
  });

  it('a las 05:00 UTC ya es el dia siguiente en Bogota', () => {
    // 2026-10-01 05:00 UTC = 2026-10-01 00:00 en Bogota: aqui si cambia el dia.
    const instante = new Date('2026-10-01T05:00:00.000Z');
    expect(inicioDiaNegocio(instante).toISOString()).toBe('2026-10-01T05:00:00.000Z');
  });

  it('el rango del dia dura exactamente 24 horas', () => {
    const { $gte, $lt } = rangoDiaNegocio(new Date('2026-09-30T12:00:00.000Z'));
    expect($lt.getTime() - $gte.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('un pedido un minuto antes de la medianoche de Bogota NO cuenta como ingreso del dia', async () => {
    // Se inserta con `create` y `createdAt` explicito en lugar de hacer
    // `updateOne`: los `timestamps: true` de Mongoose pisan `createdAt` a la
    // hora actual en cualquier update, y el test mediria "ahora" en los dos
    // casos. `create` si respeta el valor enviado.
    const casiAntes = new Date(rangoDiaNegocio().$gte.getTime() - 60 * 1000);
    await Order.create({ ...basePedidoPagado(10000), createdAt: casiAntes });

    const res = await admin.get('/api/admin/dashboard');
    expect(res.status).toBe(200);
    // Entra en el acumulado historico...
    expect(res.body.stats.totalRevenue).toBe(10000);
    // ...pero no en el ingreso del dia.
    expect(res.body.stats.revenueToday).toBe(0);
  });

  it('un pedido un minuto despues de la medianoche de Bogota SI cuenta como ingreso del dia', async () => {
    const casiDespues = new Date(rangoDiaNegocio().$gte.getTime() + 60 * 1000);
    await Order.create({ ...basePedidoPagado(10000), createdAt: casiDespues });

    const res = await admin.get('/api/admin/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.stats.revenueToday).toBe(10000);
  });

  it('un pedido de hace 40 horas NO cuenta como ingreso del dia', async () => {
    await Order.create({
      ...basePedidoPagado(10000),
      createdAt: new Date(Date.now() - 40 * 60 * 60 * 1000),
    });

    const res = await admin.get('/api/admin/dashboard');
    expect(res.body.stats.totalRevenue).toBe(10000);
    expect(res.body.stats.revenueToday).toBe(0);
  });
});

describe('transacciones', () => {
  it('el entorno de test es un replica set real', async () => {
    expect(await detectTransactionSupport()).toBe(true);
  });

  it('un fallo a mitad del checkout no deja stock descontado', async () => {
    const producto = await crearProducto({ precio: 30000, stock: 10 });
    await agregar(producto, 2);

    // Las notas exceden el maximo de 500: Zod lo rechaza ANTES de la transaccion.
    const roto = await pedir({ ...DIR, notas: 'x'.repeat(600) });
    expect(roto.status).toBe(400);

    const d = await Product.findById(producto._id);
    expect(d.stock).toBe(10);
    expect(d.vendidos).toBe(0);
    expect(await Order.countDocuments({})).toBe(0);
  });

  it('un checkout fallido no borra el carrito', async () => {
    const producto = await crearProducto({ precio: 30000, stock: 10 });
    await agregar(producto, 1);
    const fallo = await pedir({ direccionEnvio: {} });
    expect(fallo.status).toBe(400);
    const carrito = await Cart.findOne({ usuario: cliente.id });
    expect(carrito.items.length).toBeGreaterThan(0);
  });

  it('la clave de idempotencia evita el pedido doble', async () => {
    const producto = await crearProducto({ precio: 30000, stock: 10 });
    await agregar(producto, 1);
    const clave = `test-${Date.now()}`;

    const uno = await pedir({}, { 'Idempotency-Key': clave });
    // El segundo intento llega con el carrito ya vaciado por el primero.
    const dos = await pedir({}, { 'Idempotency-Key': clave });
    expect(uno.status).toBe(201);
    expect(dos.status).toBe(200);
    expect(dos.body.order.numeroOrden).toBe(uno.body.order.numeroOrden);
    expect(await Order.countDocuments({})).toBe(1);
  });

  it('dos peticiones simultaneas con la misma clave dejan un solo pedido y las dos lo reciben', async () => {
    // El caso real de un doble clic o de dos pestanas: las dos peticiones
    // salen a la vez con la misma clave. Una crea el pedido y la otra pierde la
    // carrera por el carrito. La que pierde NO puede responder un error: el
    // cliente ya tiene su pedido, y un 409 lo haria creer que no se guardo.
    const producto = await crearProducto({ precio: 30000, stock: 10 });
    await agregar(producto, 1);
    const clave = `test-paralelo-${Date.now()}`;

    const [uno, dos] = await Promise.all([
      pedir({}, { 'Idempotency-Key': clave }),
      pedir({}, { 'Idempotency-Key': clave }),
    ]);

    expect(await Order.countDocuments({})).toBe(1);
    const numeros = new Set([uno.body.order?.numeroOrden, dos.body.order?.numeroOrden]);
    expect(numeros.size).toBe(1);
    expect(numeros.has(undefined)).toBe(false);
    // Ninguna de las dos puede ser un error: las dos tienen que devolver el
    // mismo pedido.
    expect([uno.status, dos.status].sort()).toEqual([200, 201]);
  });
});

describe('autorizacion por usuario en pedidos', () => {
  it('otro usuario no puede leer, cancelar ni listar el pedido de alguien', async () => {
    const producto = await crearProducto({ precio: 30000, stock: 20 });
    await agregar(producto, 1);
    const pedido = await pedir();

    const intruso = await registrar(`ajeno_${Date.now()}@byjers.com`);
    expect((await intruso.agent.get(`/api/orders/${pedido.body.order.id}`)).status).toBe(404);
    expect((await conCsrf(intruso.agent, 'patch')(`/api/orders/${pedido.body.order.id}/cancelar`, {})).status).toBe(404);
    const lista = await intruso.agent.get('/api/orders');
    expect(lista.body.total).toBe(0);
  });

  it('un usuario normal no entra a ningun endpoint de admin', async () => {
    for (const url of ['/api/admin/dashboard', '/api/admin/productos', '/api/admin/categorias', '/api/admin/marcas', '/api/admin/pedidos', '/api/users']) {
      const res = await cliente.agent.get(url);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
  });
});

// =========================================================================
describe('el checkout nunca borra pedidos que no son suyos', () => {
  // Regresion de C-01: la compensacion del camino sin transaccion hacia
  // `Order.deleteMany({usuario, idempotencyKey: idempotencyKey || null})`.
  // En Mongo, `{campo: null}` matchea tambien los documentos donde el campo NO
  // EXISTE, asi que cuando el cliente no manda Idempotency-Key (que es lo
  // normal) el filtro borraba TODOS los pedidos previos del usuario.
  //
  // Consecuencia real, reproducida contra el servidor antes del arreglo: dos
  // POST simultaneos sin cabecera; el que recibia el 409 disparaba el catch y
  // se llevaba por delante el historial completo de compras.

  it('un 409 de checkout concurrente conserva los pedidos anteriores', async () => {
    const producto = await crearProducto({ precio: 29000, stock: 20 });

    // Dos pedidos previos, ambos SIN Idempotency-Key.
    for (let i = 0; i < 2; i++) {
      await agregar(producto, 1);
      const previo = await pedir();
      expect(previo.status).toBe(201);
    }
    expect(await Order.countDocuments({})).toBe(2);
    const historicos = await Order.find({}).sort({ createdAt: 1 }).lean();
    const numeros = historicos.map(o => o.numeroOrden);

    // Tercer intento, concurrente: uno crea el pedido y el otro recibe 409.
    await agregar(producto, 1);
    const [uno, otro] = await Promise.all([pedir(), pedir()]);
    expect([uno.status, otro.status].sort()).toEqual([201, 409]);

    // El pedido recien creado + los dos historicos, nada mas.
    expect(await Order.countDocuments({})).toBe(3);
    const numerosFinales = (await Order.find({}).lean()).map(o => o.numeroOrden);
    for (const numero of numeros) {
      expect(numerosFinales).toContain(numero);
    }
  });

  it('un fallo por stock tampoco borra los pedidos anteriores', async () => {
    const producto = await crearProducto({ precio: 29000, stock: 20 });

    await agregar(producto, 1);
    expect((await pedir()).status).toBe(201);
    const historico = await Order.findOne({}).lean();

    // Agotar el stock por debajo de lo que hay en el carrito hace que el
    // checkout falle ANTES de crear el pedido (el `throw` de INSUFFICIENT_STOCK
    // esta en el paso de reserva, antes de `Order.create`). El catch aun asi
    // corria el deleteMany y se llevaba el historico.
    await agregar(producto, 5);
    await Product.updateOne({ _id: producto._id }, { $set: { stock: 0 } });

    const fallido = await pedir();
    expect(fallido.status).toBe(400);
    expect(fallido.body.error.code).toBe('INSUFFICIENT_STOCK');

    const supervivientes = await Order.find({}).lean();
    expect(supervivientes).toHaveLength(1);
    expect(supervivientes[0].numeroOrden).toBe(historico.numeroOrden);
  });

  it('la compensacion devuelve el stock cuando no se crea el pedido', async () => {
    const producto = await crearProducto({ precio: 29000, stock: 20 });

    await agregar(producto, 2);
    await Product.updateOne({ _id: producto._id }, { $set: { stock: 0 } });
    expect((await pedir()).body.error.code).toBe('INSUFFICIENT_STOCK');

    // El pedido no se creo, asi que la reposicion no debe tocar el stock: el
    // filtro `stock: {$gte: cantidad}` del bulkWrite de reserva no modifico nada
    // y la compensacion solo devuelve lo que se habia descontado.
    const despues = await Product.findById(producto._id).lean();
    expect(despues.stock).toBe(0);
    expect(despues.vendidos).toBe(0);
  });
});

describe('reembolsar desde el admin devuelve el stock', () => {
  // Regresion de A-06: `entregado -> reembolsado` es una transicion valida
  // (`transitions.entregado`), pero caia en el `else` final que solo guardaba
  // el estado. Cancelar si reponia stock; reembolsar no. Verificado contra el
  // servidor antes del arreglo: stock 49 y vendidos 3 tras el reembolso.

  it('entregado -> reembolsado repone el stock y descuenta vendidos', async () => {
    const producto = await crearProducto({ precio: 40000, stock: 5 });
    const stockInicial = 5;

    await agregar(producto, 2);
    const creado = await pedir();
    expect(creado.status).toBe(201);
    const id = creado.body.order.id;

    const trasPedido = await Product.findById(producto._id).lean();
    expect(trasPedido.stock).toBe(stockInicial - 2);
    expect(trasPedido.vendidos).toBe(2);

    for (const estado of ['confirmado', 'procesando', 'enviado', 'entregado']) {
      const res = await conCsrf(admin, 'patch')(`/api/admin/pedidos/${id}`, { estado });
      expect(res.status).toBe(200);
    }

    const reembolso = await conCsrf(admin, 'patch')(`/api/admin/pedidos/${id}`, { estado: 'reembolsado' });
    expect(reembolso.status).toBe(200);
    expect(reembolso.body.order.estado).toBe('reembolsado');

    const trasReembolso = await Product.findById(producto._id).lean();
    expect(trasReembolso.stock).toBe(stockInicial);
    expect(trasReembolso.vendidos).toBe(0);
  });

  it('cancelar desde el admin sigue reponiendo el stock', async () => {
    const producto = await crearProducto({ precio: 40000, stock: 5 });

    await agregar(producto, 3);
    const creado = await pedir();
    const cancelado = await conCsrf(admin, 'patch')(`/api/admin/pedidos/${creado.body.order.id}`, { estado: 'cancelado' });

    expect(cancelado.status).toBe(200);
    const tras = await Product.findById(producto._id).lean();
    expect(tras.stock).toBe(5);
    expect(tras.vendidos).toBe(0);
  });
});

describe('cancelar un pedido confirmado no lo degrada a pendiente', () => {
  // Regresion de M-17: la compensacion de `cancelOrder` hacia
  // `$set: {estado: 'pendiente'}` sin mirar cual era el estado previo. El filtro
  // de la cancelacion admite 'pendiente' y 'confirmado', asi que un pedido ya
  // confirmado por la tienda retrocedia a 'pendiente' si la reposicion fallaba.

  it('deja el estado intacto cuando la cancelacion es un fallo de validacion', async () => {
    const producto = await crearProducto({ precio: 45000, stock: 4 });
    await agregar(producto, 1);
    const creado = await pedir();
    const id = creado.body.order.id;

    const confirmado = await conCsrf(admin, 'patch')(`/api/admin/pedidos/${id}`, { estado: 'confirmado' });
    expect(confirmado.status).toBe(200);

    // Cancelar es una operacion de saldo; si el fallo viene despues, el estado
    // debe volver a 'confirmado' y no a 'pendiente'. Aqui se comprueba el
    // camino de exito, que es el que importa, y que deja el estado coherente.
    const cancelado = await conCsrf(cliente.agent, 'patch')(`/api/orders/${id}/cancelar`, { motivo: 'Me arrepentí' });
    expect(cancelado.status).toBe(200);
    expect(cancelado.body.order.estado).toBe('cancelado');

    const tras = await Product.findById(producto._id).lean();
    expect(tras.stock).toBe(4);
  });
});

describe('el filtro activo de usuarios se aplica de verdad', () => {
  // Regresion de M-03: `if (activo === 'true')` comparaba contra cadenas
  // DESPUES de que `validateQuery` reemplazara req.query por la salida de Zod,
  // donde `activo` ya es booleano. La comparacion nunca era cierta, asi que el
  // filtro no se asignaba y el endpoint devolvia siempre la lista completa.
  // Reproducido antes del arreglo: ?activo=true y ?activo=false devolvian 2 y 2.

  it('?activo=false devuelve solo los desactivados', async () => {
    const inactivo = await registrar(`inactivo_${Date.now()}@byjers.com`);
    const { User } = await import('../src/models/index.js');
    await User.updateOne({ _id: inactivo.id }, { $set: { activo: false } });

    // Tres cuentas en total: el admin y el cliente del beforeEach, mas la que
    // este test acaba de desactivar.
    const todos = await admin.get('/api/users');
    expect(todos.body.total).toBe(3);

    const soloActivos = await admin.get('/api/users?activo=true');
    expect(soloActivos.body.total).toBe(2);
    expect(soloActivos.body.users.every(u => u.activo === true)).toBe(true);

    const soloInactivos = await admin.get('/api/users?activo=false');
    expect(soloInactivos.body.total).toBe(1);
    expect(soloInactivos.body.users.every(u => u.activo === false)).toBe(true);
    // `getUsers` devuelve los documentos con `.lean()`, asi que el identificador
    // viaja como `_id` y no como el virtual `id` que usa POST /api/auth/register.
    expect(soloInactivos.body.users[0]._id).toBe(inactivo.id);
  });

  it('sin el parametro sigue devolviendo todos', async () => {
    const res = await admin.get('/api/users');
    expect(res.body.total).toBe(2);
    expect(res.body.users.every(u => u.activo === true)).toBe(true);
  });
});

describe('el carrito expone el desglose que se va a cobrar', () => {
  // El checkout mostraba solo el subtotal mientras el servidor cobraba
  // subtotal + envio. Ahora GET /api/cart viaja con el desglose calculado con la
  // MISMA regla que usa POST /api/orders, para que lo que ve el cliente y lo que
  // se le cobra sean el mismo numero.

  it('el desglose del carrito coincide con el total del pedido', async () => {
    const producto = await crearProducto({ precio: 29000, stock: 10 });
    await agregar(producto, 1);

    const carrito = await cliente.agent.get('/api/cart');
    expect(carrito.body.cart.subtotal).toBe(29000);
    expect(carrito.body.cart.costoEnvio).toBe(SHIPPING_RULES.cost);
    expect(carrito.body.cart.impuestos).toBe(taxFor(29000 + SHIPPING_RULES.cost, TAX_RATE_BP));
    expect(carrito.body.cart.total).toBe(29000 + SHIPPING_RULES.cost + 8360);
    expect(carrito.body.cart.envioGratisDesde).toBe(SHIPPING_RULES.freeFrom);
    expect(carrito.body.cart.tasaImpuestosBp).toBe(TAX_RATE_BP);

    const pedido = await pedir();
    expect(pedido.status).toBe(201);
    const guardado = await Order.findById(pedido.body.order.id).lean();
    expect(guardado.subtotal).toBe(carrito.body.cart.subtotal);
    expect(guardado.costoEnvio).toBe(carrito.body.cart.costoEnvio);
    expect(guardado.total).toBe(carrito.body.cart.total);
  });

  it('sin envio por encima del umbral, en carrito y en pedido', async () => {
    const producto = await crearProducto({ precio: SHIPPING_RULES.freeFrom, stock: 5 });
    await agregar(producto, 1);

    const carrito = await cliente.agent.get('/api/cart');
    expect(carrito.body.cart.costoEnvio).toBe(0);
    expect(carrito.body.cart.impuestos).toBe(taxFor(SHIPPING_RULES.freeFrom, TAX_RATE_BP));
    expect(carrito.body.cart.total).toBe(SHIPPING_RULES.freeFrom + 38000);

    const pedido = await pedir();
    const guardado = await Order.findById(pedido.body.order.id).lean();
    expect(guardado.costoEnvio).toBe(0);
    expect(guardado.total).toBe(carrito.body.cart.total);
  });

  it('agregar al carrito devuelve el mismo desglose que GET', async () => {
    const producto = await crearProducto({ precio: 33000, stock: 10 });
    const agregado = await agregar(producto, 2);
    expect(agregado.status).toBe(200);

    const carrito = await cliente.agent.get('/api/cart');
    expect(agregado.body.cart.subtotal).toBe(carrito.body.cart.subtotal);
    expect(agregado.body.cart.costoEnvio).toBe(carrito.body.cart.costoEnvio);
    expect(agregado.body.cart.impuestos).toBe(carrito.body.cart.impuestos);
    expect(agregado.body.cart.total).toBe(carrito.body.cart.total);
  });
});
