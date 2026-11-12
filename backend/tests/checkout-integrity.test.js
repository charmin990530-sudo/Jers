import { beforeEach, afterEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { User, Product, Cart, Order } from '../src/models/index.js';
import { routes } from '../src/routes/index.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { JWT_SECRET, JWT_COOKIE_NAME } from '../src/config/env.js';

const app = express();
app.use(express.json(), cookieParser());
for (const [name, router] of Object.entries(routes)) app.use('/api/' + name, router);
app.use(errorHandler);
const direccionEnvio = { alias: 'Casa', nombreCompleto: 'Persona Ficticia', telefono: '3000000000', direccion: 'Calle ficticia 10', ciudad: 'Bogotá', departamento: 'Cundinamarca' };
const newProduct = (extra = {}) => Product.create({ nombre: 'Producto ficticio ' + Math.random(), descripcion: 'Producto de prueba', precio: 50000, stock: 10, categoria: '507f1f77bcf86cd799439011', marca: '507f1f77bcf86cd799439012', imagenes: [{ url: '/img/placeholder.svg' }], ...extra });
let user, product, cookie;
beforeEach(async () => {
  user = await User.create({ nombre: 'Persona', apellido: 'Ficticia', email: 'comprador@example.com', password: 'ClaveFicticia2026!', aceptoTerminos: true, aceptoPrivacidad: true });
  product = await newProduct();
  cookie = `${JWT_COOKIE_NAME}=${jwt.sign({ id: user._id, ver: user.tokenVersion }, JWT_SECRET)}`;
  await request(app).post('/api/cart').set('Cookie', cookie).send({ productoId: String(product._id), cantidad: 1 }).expect(200);
});
afterEach(() => jest.restoreAllMocks());

describe('Importes y concurrencia del checkout', () => {
  it('las ediciones concurrentes no llevan la cantidad fuera de 1 a 99', async () => {
    await Product.updateOne({ _id: product._id }, { $set: { stock: 1000 } });
    const cart = await Cart.findOne({ usuario: user._id });
    await Cart.updateOne({ _id: cart._id }, { $set: { 'items.0.cantidad': 90 } });
    const operations = [];
    for (let i = 0; i < 8; i++) {
      operations.push(request(app).post('/api/cart').set('Cookie', cookie).send({ productoId: String(product._id), cantidad: 99 }));
      operations.push(request(app).patch('/api/cart/' + cart.items[0]._id).set('Cookie', cookie).send({ cantidad: 1 }));
    }
    const responses = await Promise.all(operations);
    expect(responses.every(response => [200, 400].includes(response.status))).toBe(true);
    const final = await Cart.findById(cart._id);
    expect(final.items).toHaveLength(1);
    expect(final.items[0].cantidad).toBe(1);
  });

  it('un checkout vivo bloquea añadir, editar, quitar y vaciar el carrito', async () => {
    const cart = await Cart.findOne({ usuario: user._id });
    await Cart.updateOne({ _id: cart._id }, { $set: { checkoutToken: 'checkout-ficticio', checkoutExpiresAt: new Date(Date.now() + 60000) } });
    const itemId = cart.items[0]._id;
    for (const response of await Promise.all([
      request(app).post('/api/cart').set('Cookie', cookie).send({ productoId: String(product._id), cantidad: 1 }),
      request(app).patch('/api/cart/' + itemId).set('Cookie', cookie).send({ cantidad: 2 }),
      request(app).delete('/api/cart/' + itemId).set('Cookie', cookie),
      request(app).delete('/api/cart').set('Cookie', cookie),
    ])) expect(response.status).toBe(409);
    expect((await Cart.findById(cart._id)).items[0].cantidad).toBe(1);
  });

  it('no consume un carrito que cambió después de calcular el pedido', async () => {
    const update = Cart.findOneAndUpdate.bind(Cart);
    jest.spyOn(Cart, 'findOneAndUpdate').mockImplementationOnce(async (...args) => {
      await Cart.updateOne({ usuario: user._id }, { $set: { 'items.0.cantidad': 2 } });
      return update(...args);
    });
    await request(app).post('/api/orders').set('Cookie', cookie).send({ direccionEnvio }).expect(409);
    expect(await Order.countDocuments()).toBe(0);
    expect((await Cart.findOne({ usuario: user._id })).items[0].cantidad).toBe(2);
    expect((await Product.findById(product._id)).stock).toBe(10);
  });
  it('muestra el precio vigente del producto al volver a consultar el carrito', async () => {
    await Product.updateOne({ _id: product._id }, { $set: { precio: 65000 } });
    const response = await request(app).get('/api/cart').set('Cookie', cookie).expect(200);
    expect(response.body.cart.items[0].precioUnitario).toBe(65000);
    expect(response.body.cart.subtotal).toBe(65000);
  });

  it('exige revisar un total que cambió antes de reservar stock o crear el pedido', async () => {
    const original = await request(app).get('/api/cart').set('Cookie', cookie).expect(200);
    await Product.updateOne({ _id: product._id }, { $set: { precio: 65000 } });
    const response = await request(app).post('/api/orders').set('Cookie', cookie).send({ direccionEnvio, expectedTotal: original.body.cart.total }).expect(409);
    expect(response.body.error.code).toBe('PRICE_CHANGED');
    expect(await Order.countDocuments()).toBe(0);
    expect((await Product.findById(product._id)).stock).toBe(10);
    expect(await Cart.countDocuments({ usuario: user._id })).toBe(1);
    const actualizado = await request(app).get('/api/cart').set('Cookie', cookie);
    const accepted = await request(app).post('/api/orders').set('Cookie', cookie).send({ direccionEnvio, expectedTotal: actualizado.body.cart.total }).expect(201);
    expect(accepted.body.order.total).toBe(actualizado.body.cart.total);
  });

  it('un reintento conserva el mismo pedido, desglose y enlace de confirmación', async () => {
    const send = () => request(app).post('/api/orders').set('Cookie', cookie).set('Idempotency-Key', 'reintento-ficticio-2026').send({ direccionEnvio });
    const first = await send().expect(201), retry = await send().expect(200);
    expect(retry.body.order).toEqual(first.body.order);
    expect(await Order.countDocuments()).toBe(1);
    expect((await Product.findById(product._id)).stock).toBe(9);
  });

  it('limpiar líneas inválidas no elimina un producto añadido simultáneamente', async () => {
    const invalid = await newProduct({ activo: false });
    const added = await newProduct();
    const cart = await Cart.findOne({ usuario: user._id });
    cart.items.push({ producto: invalid._id, cantidad: 1, precioUnitario: invalid.precio, nombreSnapshot: invalid.nombre });
    await cart.save();
    const update = Cart.updateOne.bind(Cart);
    jest.spyOn(Cart, 'updateOne').mockImplementationOnce(async (...args) => {
      await update({ _id: cart._id }, { $push: { items: { producto: added._id, cantidad: 1, precioUnitario: added.precio, nombreSnapshot: added.nombre } } });
      return update(...args);
    });
    await request(app).get('/api/cart').set('Cookie', cookie).expect(200);
    const final = await Cart.findById(cart._id).lean();
    expect(final.items.map(item => String(item.producto)).sort()).toEqual([String(product._id), String(added._id)].sort());
  });

  it('un pedido ya pagado no ofrece cancelación al cliente', async () => {
    const created = await request(app).post('/api/orders').set('Cookie', cookie).send({ direccionEnvio }).expect(201);
    await Order.updateOne({ _id: created.body.order.id }, { $set: { estadoPago: 'pagado' } });
    const response = await request(app).get('/api/orders').set('Cookie', cookie).expect(200);
    expect(response.body.orders[0].puedeCancelar).toBe(false);
  });
});
