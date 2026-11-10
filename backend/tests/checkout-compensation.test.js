/**
 * checkout-compensation.test.js - Integridad del stock cuando NO hay replica set
 *
 * QUE FALLA ANTES DE ESTE ARCHIVO
 * --------------------------------
 * Crear un pedido reserva stock, crea el pedido y consume el carrito. Con
 * replica set las tres cosas van en una transaccion: o se aplican todas o
 * ninguna. Sin replica set (un `mongod` local normal, que es lo que documenta
 * el README) `withTransaction` ejecuta el callback con `session: null` y la
 * coherencia la deja ENTERA en la compensacion del controlador.
 *
 * Esa compensacion estaba rota de una forma que inflaba el inventario:
 *
 *   1. Devolvia el stock de TODAS las lineas del carrito, se hubieran
 *      descontado o no. Si el fallo era "el carrito ya tiene otro checkout en
 *      curso" (el `checkoutToken` ya estaba puesto), NO se habia descontado
 *      nada: cada intento fallido sumaba stock que nunca habia salido.
 *   2. Si el stock se agotaba en una linea, el `bulkWrite` aplicaba las
 *      anteriores y dejaba la que no matcheaba sin tocar, sin error. La
 *      compensacion devolvia tambien la de la que nunca se habia descontado.
 *
 * El efecto es stock fantasma: el inventario crece con cada checkout fallido
 * y la tienda acaba vendiendo producto que no existe.
 *
 * El test fuerza el despliegue sin replica set, igual que hace
 * `admin-order-compensation.test.js` para la rama del panel.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

// ESM no deja reasignar un import ya enlazado: el mock del modulo de
// transacciones tiene que registrarse ANTES de que nadie lo importe.
jest.unstable_mockModule('../src/services/transaction.js', () => ({
  withTransaction: async fn => ({ transactional: false, result: await fn({ session: null }) }),
  detectTransactionSupport: async () => false,
  resetTransactionSupportCache: () => {},
}));

let Product;
let User;
let Order;
let Cart;
let routes;
let notFound;
let errorHandler;
let JWT_SECRET;
let JWT_COOKIE_NAME;
let detectTransactionSupport;

beforeAll(async () => {
  ({ Product, User, Order, Cart } = await import('../src/models/index.js'));
  ({ routes } = await import('../src/routes/index.js'));
  ({ notFound, errorHandler } = await import('../src/middleware/errorHandler.js'));
  ({ JWT_SECRET, JWT_COOKIE_NAME } = await import('../src/config/env.js'));
  ({ detectTransactionSupport } = await import('../src/services/transaction.js'));
});

const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/cart', routes.cart);
  app.use('/api/orders', routes.orders);
  app.use(notFound);
  app.use(errorHandler);
  return app;
};

const DIR = {
  alias: 'Casa', nombreCompleto: 'Cliente Prueba', telefono: '3001234567',
  direccion: 'Calle 1 #2-3', ciudad: 'Bogota', departamento: 'Cundinamarca',
};

const crearUsuario = () => User.create({
  nombre: 'Comprador', apellido: 'Prueba',
  email: `cli${Math.random().toString(36).slice(2, 9)}@example.com`,
  password: bcrypt.hashSync('ClaveSegura123', 12),
  aceptoTerminos: true, aceptoPrivacidad: true,
});

const cookieDe = user => `${JWT_COOKIE_NAME}=${jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' })}`;

const crearProducto = (overrides = {}) => Product.create({
  nombre: `Producto ${Math.random().toString(36).slice(2, 9)}`,
  descripcion: 'Producto de prueba para la compensacion del checkout',
  precio: 20000,
  stock: 10,
  vendidos: 0,
  categoria: '507f1f77bcf86cd799439011',
  marca: '507f1f77bcf86cd799439012',
  imagenes: [{ url: '/img/placeholder.svg', esPrincipal: true }],
  ...overrides,
});

const agregarAlCarrito = (app, cookie, producto, cantidad) =>
  request(app)
    .post('/api/cart')
    .set('Cookie', cookie)
    .send({ productoId: producto._id.toString(), cantidad });

const pedirPedido = (app, cookie, headers = {}) =>
  request(app)
    .post('/api/orders')
    .set('Cookie', cookie)
    .set(headers)
    .send({ direccionEnvio: DIR });

describe('checkout sin replica set: el stock nunca se inventa', () => {
  let app;
  let cookie;
  let usuario;

  beforeEach(async () => {
    app = createTestApp();
    usuario = await crearUsuario();
    cookie = cookieDe(usuario);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('el mock de despliegue es el que se cree: no hay replica set', async () => {
    await expect(detectTransactionSupport()).resolves.toBe(false);
  });

  it('no devuelve stock que nunca se desconto cuando el checkout ya esta en curso', async () => {
    const producto = await crearProducto({ stock: 10 });
    await agregarAlCarrito(app, cookie, producto, 2);

    // Otro intento de checkout tomo el carrito: el `checkoutToken` sigue puesto.
    const carrito = await Cart.findOne({ usuario: usuario._id });
    await Cart.updateOne(
      { _id: carrito._id },
      { $set: { checkoutToken: 'otro-intento', checkoutExpiresAt: new Date(Date.now() + 120000) } },
    );

    const res = await pedirPedido(app, cookie);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CHECKOUT_IN_PROGRESS');

    // El stock NO se toco al reservar y NO debe tocarse al compensar.
    const final = await Product.findById(producto._id).lean();
    expect(final.stock).toBe(10);
    expect(final.vendidos).toBe(0);
    expect(await Order.countDocuments({})).toBe(0);
  });

  it('devuelve solo el stock de las lineas que si se descontaron', async () => {
    const conStock = await crearProducto({ stock: 10 });
    const sinStock = await crearProducto({ stock: 2 });
    await agregarAlCarrito(app, cookie, conStock, 2);
    await agregarAlCarrito(app, cookie, sinStock, 2);

    // El cliente ya vio el stock (2) y lo metio en el carrito. Aqui, justo
    // cuando el checkout toma el carrito, otra compra se lleva la ultima
    // unidad: la reserva de esa linea ya no puede aplicarse. Es la carrera que
    // el `bulkWrite` resolvia a medias y que ahora la compensacion tiene que
    // distinguir linea a linea.
    const findOneAndUpdateReal = Cart.findOneAndUpdate.bind(Cart);
    jest.spyOn(Cart, 'findOneAndUpdate').mockImplementation(async (...args) => {
      const resultado = await findOneAndUpdateReal(...args);
      await Product.updateOne({ _id: sinStock._id }, { $inc: { stock: -1 } });
      return resultado;
    });

    const res = await pedirPedido(app, cookie);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');

    // La linea con stock se desconto y hay que devolverla; la que se agoto no
    // llego a descontarse y NO hay que "devolverla" (inflaria el inventario).
    const finalConStock = await Product.findById(conStock._id).lean();
    const finalSinStock = await Product.findById(sinStock._id).lean();
    expect(finalConStock.stock).toBe(10);
    expect(finalConStock.vendidos).toBe(0);
    expect(finalSinStock.stock).toBe(1);
    expect(finalSinStock.vendidos).toBe(0);
    expect(await Order.countDocuments({})).toBe(0);
  });

  it('el carrito sigue disponible tras un checkout fallido', async () => {
    const producto = await crearProducto({ stock: 2 });
    await agregarAlCarrito(app, cookie, producto, 2);

    const findOneAndUpdateReal = Cart.findOneAndUpdate.bind(Cart);
    jest.spyOn(Cart, 'findOneAndUpdate').mockImplementation(async (...args) => {
      const resultado = await findOneAndUpdateReal(...args);
      await Product.updateOne({ _id: producto._id }, { $inc: { stock: -1 } });
      return resultado;
    });

    const res = await pedirPedido(app, cookie);
    expect(res.status).toBe(400);

    const carrito = await Cart.findOne({ usuario: usuario._id }).lean();
    expect(carrito).not.toBeNull();
    expect(carrito.items).toHaveLength(1);
    expect(carrito.checkoutToken ?? null).toBeNull();
  });
});
