/**
 * PATCH /api/admin/pedidos/:id — compensacion sin replica set.
 *
 * QUE FALLA ANTES DE ESTE ARCHIVO
 * --------------------------------
 * Cancelar o reembolsar un pedido desde el admin hace un cambio de estado MAS un
 * bulkWrite de stock. Con replica set van en la misma transaccion y no hay nada
 * que compensar. Sin replica set, `withTransaction` ejecuta el callback con
 * `session: null` (services/transaction.js:122) y la coherencia la deja
 * enteramente en la logica de compensacion del controlador.
 *
 * Esa compensacion estaba rota: `cancelacion` se declaraba DENTRO del callback
 * de la transaccion (adminController.js:341) pero se usaba en el `catch`, fuera
 * de su alcance (adminController.js:388). El `catch` se ejecuta precisamente
 * cuando el bulkWrite de stock falla, o sea justo cuando la compensacion hace
 * falta, asi que:
 *
 *   1. `cancelacion` era un ReferenceError en el `catch`, no un undefined.
 *   2. Ese ReferenceError se comia el resto del `catch`: el error que hacia
 *      falta devolver era el de Mongo y en su lugar se respondia 500 por un
 *      ReferenceError interno, sin dejar rastro en el pedido.
 *   3. Lo grave: la compensacion no se ejecutaba. El pedido se quedaba
 *      `cancelado`, con el stock aun descontado y `vendidos` sin devolver.
 *      exactamente la corrupcion que la rama de compensacion existe para evitar.
 *
 * Con replica set el `catch` tambien se alcanza, pero la transaccion revierte el
 * cambio de estado, `stillOpen` queda en null y la rama de compensacion no
 * llega a ejecutarse: por eso ningun test anterior lo veia. Estos tests fuerzan
 * el despliegue sin replica set.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

// ESM no deja reasignar un import ya enlazado, asi que la unica forma de cambiar
// lo que ve el controlador es registrar el mock del modulo ANTES de que nadie lo
// importe. Por eso los imports de models/routes van abajo, en beforeAll.
jest.unstable_mockModule('../src/services/transaction.js', () => ({
  withTransaction: async fn => ({ transactional: false, result: await fn({ session: null }) }),
  detectTransactionSupport: async () => false,
  resetTransactionSupportCache: () => {},
}));

let Product;
let User;
let Order;
let routes;
let notFound;
let errorHandler;
let JWT_SECRET;
let JWT_COOKIE_NAME;
let detectTransactionSupport;

beforeAll(async () => {
  ({ Product, User, Order } = await import('../src/models/index.js'));
  ({ routes } = await import('../src/routes/index.js'));
  ({ notFound, errorHandler } = await import('../src/middleware/errorHandler.js'));
  ({ JWT_SECRET, JWT_COOKIE_NAME } = await import('../src/config/env.js'));
  ({ detectTransactionSupport } = await import('../src/services/transaction.js'));
});

const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/admin', routes.admin);
  app.use(notFound);
  app.use(errorHandler);
  return app;
};

const crearAdmin = () => User.create({
  nombre: 'Admin',
  apellido: 'Prueba',
  email: `admin${Math.random().toString(36).slice(2, 9)}@example.com`,
  password: bcrypt.hashSync('ClaveSegura123', 12),
  aceptoTerminos: true,
  aceptoPrivacidad: true,
  role: 'admin',
});

const crearUsuario = () => User.create({
  nombre: 'Comprador',
  apellido: 'Prueba',
  email: `cli${Math.random().toString(36).slice(2, 9)}@example.com`,
  password: bcrypt.hashSync('ClaveSegura123', 12),
  aceptoTerminos: true,
  aceptoPrivacidad: true,
});

const cookieDe = user => `${JWT_COOKIE_NAME}=${jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' })}`;

const crearProducto = () => Product.create({
  nombre: 'Labial matte',
  slug: `labial-${Math.random().toString(36).slice(2, 9)}`,
  descripcion: 'Labial de prueba',
  precio: 20000,
  stock: 50,
  vendidos: 2,
  // El modelo los exige; aqui no se traversesn porque lo que se prueba es la
  // compensacion del stock, no el guardado de un producto real.
  categoria: '507f1f77bcf86cd799439011',
  marca: '507f1f77bcf86cd799439012',
});

const crearPedido = async ({ producto, usuario, estado = 'confirmado', cantidad = 2 }) => {
  const subtotal = producto.precio * cantidad;
  return Order.create({
    usuario: usuario._id,
    items: [{
      producto: producto._id,
      nombre: producto.nombre,
      precioUnitario: producto.precio,
      cantidad,
      subtotal,
    }],
    subtotal,
    costoEnvio: 0,
    impuestos: 0,
    total: subtotal,
    estado,
    estadoPago: 'pendiente',
    metodoPago: 'whatsapp',
    direccionEnvio: {
      alias: 'Casa',
      nombreCompleto: 'Comprador Prueba',
      telefono: '3000000000',
      direccion: 'Calle 1 # 2-3',
      ciudad: 'Bogota',
      departamento: 'Cundinamarca',
    },
  });
};

describe('updateAdminOrder: compensacion sin replica set', () => {
  let app;
  let cookie;

  beforeEach(async () => {
    app = createTestApp();
    const admin = await crearAdmin();
    cookie = cookieDe(admin);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('el mock de despliegue es el que se cree: no hay replica set', async () => {
    // Guarda contra un test que dejara de exerter su influencia: si el mock se
    // pierde, los dos tests siguientes pasan por la rama transaccional y no
    // comprueban nada.
    await expect(detectTransactionSupport()).resolves.toBe(false);
  });

  it('responde con 5xx en vez de colgarse cuando falla la escritura de stock', async () => {
    const producto = await crearProducto();
    const usuario = await crearUsuario();
    const pedido = await crearPedido({ producto, usuario });
    // El primer bulkWrite (dentro del callback) falla; el estado ya quedo escrito
    // porque sin transaccion cada opcion va por separado.
    jest.spyOn(Product, 'bulkWrite').mockRejectedValueOnce(new Error('stock: fallo simulado'));

    const res = await request(app)
      .patch(`/api/admin/pedidos/${pedido._id}`)
      .set('Cookie', cookie)
      .send({ estado: 'cancelado' });

    // Con el ReferenceError la peticion si respondia, pero con el error equivocado
    // y sin compensar nada. Este test fija que el 5xx que ve el cliente es el de
    // Mongo, no el de un ReferenceError del propio controlador.
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(res.body.error.message).not.toMatch(/cancelacion/);
  });

  it('revierte el estado del pedido y repone el stock tras el fallo', async () => {
    const producto = await crearProducto();
    const usuario = await crearUsuario();
    const pedido = await crearPedido({ producto, usuario });
    jest.spyOn(Product, 'bulkWrite')
      .mockRejectedValueOnce(new Error('stock: fallo simulado'))
      .mockResolvedValueOnce({ ok: 1, modifiedCount: 1 });

    await request(app)
      .patch(`/api/admin/pedidos/${pedido._id}`)
      .set('Cookie', cookie)
      .send({ estado: 'cancelado' });

    const pedidoFinal = await Order.findById(pedido._id).lean();
    expect(pedidoFinal.estado).toBe('confirmado');
    expect(pedidoFinal.canceladoEn ?? null).toBeNull();
    expect(pedidoFinal.motivoCancelacion ?? null).toBeNull();

    const productoFinal = await Product.findById(producto._id).lean();
    expect(productoFinal.stock).toBe(50);
    expect(productoFinal.vendidos).toBe(2);
  });
});