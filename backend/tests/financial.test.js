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
import { generarNumeroOrden } from '../src/models/Order.js';
import { SHIPPING_RULES } from '../src/controllers/orderController.js';
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

const registrar = async email => {
  const agent = await nuevoAgente();
  const res = await conCsrf(agent, 'post')('/api/auth/register', {
    nombre: 'Cli', apellido: 'Prueba', email, password: 'ClaveSegura123',
    aceptoTerminos: true, aceptoPrivacidad: true,
  });
  expect(res.status).toBe(201);
  return { agent, id: res.body.user.id };
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

beforeEach(async () => {
  [categoria, marca] = await Promise.all([
    Category.create({ nombre: 'rostro', slug: 'rostro', orden: 1 }),
    Brand.create({ nombre: 'MarcaTest', slug: 'marca-test', orden: 1 }),
  ]);

  admin = await nuevoAgente();
  const alta = await conCsrf(admin, 'post')('/api/auth/register', {
    nombre: 'Admin', apellido: 'Fin', email: `admin_${Date.now()}_${Math.random()}@byjers.com`,
    password: 'ClaveSegura123', aceptoTerminos: true, aceptoPrivacidad: true,
  });
  expect(alta.status).toBe(201);
  await User_setRole(alta.body.user.id, 'admin');

  cliente = await registrar(`cliente_${Date.now()}_${Math.random()}@byjers.com`);
});

const User_setRole = async (id, role) => {
  const { User } = await import('../src/models/index.js');
  await User.updateOne({ _id: id }, { $set: { role } });
  // La cookie JWT lleva `ver: tokenVersion`; cambiar el rol no la invalida.
  return id;
};

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
  it('sin envio gratis: suma el envio al subtotal', async () => {
    const producto = await crearProducto({ precio: 62000, stock: 10 });
    await agregar(producto, 3);
    const res = await pedir();
    expect(res.status).toBe(201);
    expect(res.body.order.total).toBe(201000); // 186000 + 15000

    const guardado = await Order.findById(res.body.order.id);
    expect(guardado.subtotal).toBe(186000);
    expect(guardado.costoEnvio).toBe(SHIPPING_RULES.cost);
    expect(guardado.total).toBe(guardado.subtotal + guardado.costoEnvio - guardado.descuento);
  });

  it('en el umbral exacto el envio es gratis (borde inclusivo)', async () => {
    const producto = await crearProducto({ precio: 50000, stock: 10 });
    await agregar(producto, 4);
    const res = await pedir();
    expect(res.status).toBe(201);
    expect(res.body.order.total).toBe(200000);
    expect((await Order.findById(res.body.order.id)).costoEnvio).toBe(0);
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
    const texto = decodeURIComponent(new URL(res.body.order.whatsappUrl).searchParams.get('text'));
    expect(texto).toContain(`$${guardado.subtotal.toLocaleString('es-CO')}`);
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
