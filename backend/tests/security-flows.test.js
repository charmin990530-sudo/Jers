import { describe, it, expect, beforeEach } from '@jest/globals';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { routes } from '../src/routes/index.js';
import { notFound, errorHandler } from '../src/middleware/errorHandler.js';
import { JWT_SECRET, JWT_COOKIE_NAME } from '../src/config/env.js';
import { User, Product, Cart, Order, Contact } from '../src/models/index.js';

const createApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/auth', routes.auth);
  app.use('/api/cart', routes.cart);
  app.use('/api/orders', routes.orders);
  app.use('/api/contact', routes.contact);
  app.use(notFound);
  app.use(errorHandler);
  return app;
};

const userPayload = email => ({
  nombre: 'Prueba',
  apellido: 'Segura',
  email,
  password: 'password123',
  aceptoTerminos: true,
  aceptoPrivacidad: true,
});

const address = {
  alias: 'Casa',
  nombreCompleto: 'Cliente Prueba',
  telefono: '3001234567',
  direccion: 'Calle 123',
  ciudad: 'Bogotá',
  departamento: 'Cundinamarca',
};

describe('Security and commerce flows', () => {
  let app;

  beforeEach(() => {
    app = createApp();
  });

  it('aplica remembered session and revokes it on logout', async () => {
    const payload = userPayload('session@example.com');
    await request(app).post('/api/auth/register').send(payload).expect(201);
    const login = await request(app).post('/api/auth/login').send({ ...payload, rememberMe: true }).expect(200);
    const cookie = login.headers['set-cookie'][0].split(';')[0];
    expect(login.headers['set-cookie'][0]).toMatch(/Max-Age=2592000/);
    await request(app).get('/api/auth/me').set('Cookie', cookie).expect(200);
    await request(app).post('/api/auth/logout').set('Cookie', cookie).expect(200);
    const revoked = await request(app).get('/api/auth/me').set('Cookie', cookie).expect(401);
    expect(revoked.body.error.code).toBe('TOKEN_REVOKED');
  });

  it('revokes existing sessions after password reset', async () => {
    const payload = userPayload('reset@example.com');
    await request(app).post('/api/auth/register').send(payload).expect(201);
    const oldLogin = await request(app).post('/api/auth/login').send({ email: payload.email, password: payload.password }).expect(200);
    const oldCookie = oldLogin.headers['set-cookie'][0].split(';')[0];
    const token = crypto.randomBytes(32).toString('hex');
    const user = await User.findOne({ email: payload.email });
    user.resetPasswordToken = crypto.createHash('sha256').update(token).digest('hex');
    user.resetPasswordExpires = new Date(Date.now() + 3600000);
    await user.save({ validateBeforeSave: false });
    const reset = await request(app).post('/api/auth/reset-password').send({ token, password: 'newpassword123', confirmPassword: 'newpassword123' }).expect(200);
    expect(reset.headers['set-cookie']).toBeDefined();
    const revoked = await request(app).get('/api/auth/me').set('Cookie', oldCookie).expect(401);
    expect(revoked.body.error.code).toBe('TOKEN_REVOKED');
  });

  it('valida y persiste contacto, y descarta honeypot', async () => {
    const valid = await request(app).post('/api/contact').send({ nombre: 'Cliente', telefono: '3001234567', email: 'cliente@example.com', mensaje: 'Mensaje de contacto sufficiently long' }).expect(201);
    expect(valid.body.success).toBe(true);
    expect(await Contact.countDocuments()).toBe(1);
    await request(app).post('/api/contact').send({ nombre: 'Spam', telefono: '3001234567', email: 'spam@example.com', mensaje: 'Mensaje de contacto sufficiently long', website: 'https://spam.example' }).expect(202);
    expect(await Contact.countDocuments()).toBe(1);
    await request(app).post('/api/contact').send({ nombre: 'X', telefono: 'bad', email: 'bad', mensaje: 'corto' }).expect(400);
  });

  it('evita overselling con pedidos concurrentes', async () => {
    const product = await Product.create({ nombre: 'Stock limitado', descripcion: 'Producto de stock limitado', precio: 1000, stock: 1, categoria: '507f1f77bcf86cd799439011', marca: '507f1f77bcf86cd799439012', imagenes: [{ url: '/img/placeholder.svg' }] });
    const cookies = [];
    for (let index = 0; index < 2; index += 1) {
      const user = await User.create(userPayload(`concurrent-${index}@example.com`));
      const token = jwt.sign({ id: user._id, ver: user.tokenVersion }, JWT_SECRET, { expiresIn: '1d' });
      cookies.push(`${JWT_COOKIE_NAME}=${token}`);
      await Cart.create({ usuario: user._id, items: [{ producto: product._id, cantidad: 1, precioUnitario: 1000, nombreSnapshot: product.nombre }] });
    }
    const responses = await Promise.all(cookies.map(cookie => request(app).post('/api/orders').set('Cookie', cookie).send({ direccionEnvio: address })));
    expect(responses.map(response => response.status).sort()).toEqual([201, 400]);
    const updated = await Product.findById(product._id);
    expect(updated.stock).toBe(0);
    expect(updated.vendidos).toBe(1);
    expect(await Order.countDocuments()).toBe(1);
  });
});
