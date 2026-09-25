import { describe, it, expect, beforeEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import { User, Product, Cart, Order } from '../src/models/index.js';
import { routes } from '../src/routes/index.js';
import { notFound, errorHandler } from '../src/middleware/errorHandler.js';
import { JWT_SECRET, JWT_COOKIE_NAME } from '../src/config/env.js';
import bcrypt from 'bcryptjs';

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

describe('Cart & Orders API', () => {
  let app;
  let authCookie;
  let testUser;
  let testProduct;

  beforeEach(async () => {
    app = createTestApp();
    await User.deleteMany({});
    await Product.deleteMany({});
    await Cart.deleteMany({});
    await Order.deleteMany({});

    testProduct = await Product.create({
      nombre: 'Test Product',
      slug: 'test-product',
      descripcion: 'Producto de prueba',
      precio: 50000,
      stock: 10,
      categoria: '507f1f77bcf86cd799439011',
      marca: '507f1f77bcf86cd799439012',
      imagenes: [{ url: 'https://example.com/img.jpg', esPrincipal: true }]
    });

    const hashedPassword = await bcrypt.hash('password123', 12);
    testUser = await User.create({
      nombre: 'Test',
      apellido: 'User',
      email: 'test@example.com',
      password: hashedPassword,
      aceptoTerminos: true,
      aceptoPrivacidad: true
    });

    const token = jwt.sign({ id: testUser._id }, JWT_SECRET, { expiresIn: '7d' });
    authCookie = `${JWT_COOKIE_NAME}=${token}`;
  });

  describe('GET /api/cart', () => {
    it('debe retornar carrito vacío para usuario nuevo', async () => {
      const res = await request(app)
        .get('/api/cart')
        .set('Cookie', authCookie)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.cart.items).toEqual([]);
      expect(res.body.cart.totalItems).toBe(0);
      expect(res.body.cart.subtotal).toBe(0);
    });
  });

  describe('POST /api/cart', () => {
    it('debe agregar producto al carrito', async () => {
      const res = await request(app)
        .post('/api/cart')
        .set('Cookie', authCookie)
        .send({ productoId: testProduct._id.toString(), cantidad: 2 })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Producto agregado al carrito');
      expect(res.body.cart.items.length).toBe(1);
      expect(res.body.cart.items[0].cantidad).toBe(2);
      expect(res.body.cart.items[0].precioUnitario).toBe(50000);
      expect(res.body.cart.subtotal).toBe(100000);
    });

    it('debe fallar si producto no existe', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const res = await request(app)
        .post('/api/cart')
        .set('Cookie', authCookie)
        .send({ productoId: fakeId, cantidad: 1 })
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('PRODUCT_NOT_FOUND');
    });

    it('debe fallar si stock insuficiente', async () => {
      const res = await request(app)
        .post('/api/cart')
        .set('Cookie', authCookie)
        .send({ productoId: testProduct._id.toString(), cantidad: 50 })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('INSUFFICIENT_STOCK');
    });

    it('debe incrementar cantidad si producto ya está en carrito', async () => {
      await request(app)
        .post('/api/cart')
        .set('Cookie', authCookie)
        .send({ productoId: testProduct._id.toString(), cantidad: 1 });

      const res = await request(app)
        .post('/api/cart')
        .set('Cookie', authCookie)
        .send({ productoId: testProduct._id.toString(), cantidad: 2 })
        .expect(200);

      expect(res.body.cart.items[0].cantidad).toBe(3);
    });
  });

  describe('PATCH /api/cart/:itemId', () => {
    let itemId;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/cart')
        .set('Cookie', authCookie)
        .send({ productoId: testProduct._id.toString(), cantidad: 1 });
      itemId = res.body.cart.items[0]._id;
    });

    it('debe actualizar cantidad', async () => {
      const res = await request(app)
        .patch(`/api/cart/${itemId}`)
        .set('Cookie', authCookie)
        .send({ cantidad: 5 })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.cart.items[0].cantidad).toBe(5);
    });

    it('debe eliminar item si cantidad < 1', async () => {
      const res = await request(app)
        .delete(`/api/cart/${itemId}`)
        .set('Cookie', authCookie)
        .expect(200);

      expect(res.body.cart.items.length).toBe(0);
    });
  });

  describe('DELETE /api/cart/:itemId', () => {
    let itemId;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/cart')
        .set('Cookie', authCookie)
        .send({ productoId: testProduct._id.toString(), cantidad: 1 });
      itemId = res.body.cart.items[0]._id;
    });

    it('debe eliminar item del carrito', async () => {
      const res = await request(app)
        .delete(`/api/cart/${itemId}`)
        .set('Cookie', authCookie)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.cart.items.length).toBe(0);
    });
  });

  describe('DELETE /api/cart', () => {
    it('debe vaciar carrito completo', async () => {
      await request(app)
        .post('/api/cart')
        .set('Cookie', authCookie)
        .send({ productoId: testProduct._id.toString(), cantidad: 1 });

      const res = await request(app)
        .delete('/api/cart')
        .set('Cookie', authCookie)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.cart.items.length).toBe(0);
    });
  });

  const shippingAddress = {
    alias: 'Casa',
    nombreCompleto: 'Test User',
    telefono: '3001234567',
    direccion: 'Calle 123',
    ciudad: 'Bogotá',
    departamento: 'Cundinamarca',
    codigoPostal: '110111'
  };

describe('POST /api/orders', () => {

    it('debe crear pedido desde carrito', async () => {
      await request(app)
        .post('/api/cart')
        .set('Cookie', authCookie)
        .send({ productoId: testProduct._id.toString(), cantidad: 1 });

      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', authCookie)
        .send({ direccionEnvio: shippingAddress })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('Pedido creado');
      expect(res.body.order).toBeDefined();
      expect(res.body.order.numeroOrden).toMatch(/^BJ-\d{6}-[A-Z0-9]{6}$/);
      expect(res.body.order.whatsappUrl).toContain('wa.me');
      expect(res.body.order.total).toBeGreaterThan(0);
    });

    it('debe fallar con carrito vacío', async () => {
      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', authCookie)
        .send({ direccionEnvio: shippingAddress })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('EMPTY_CART');
    });

    it('debe fallar sin autenticación', async () => {
      const res = await request(app)
        .post('/api/orders')
        .send({ direccionEnvio: shippingAddress })
        .expect(401);

      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/orders', () => {
    beforeEach(async () => {
      await Cart.create({
        usuario: testUser._id,
        items: [{ producto: testProduct._id, cantidad: 1, precioUnitario: 50000, nombreSnapshot: 'Test', imagenSnapshot: 'img.jpg' }]
      });

      await request(app)
        .post('/api/orders')
        .set('Cookie', authCookie)
        .send({ direccionEnvio: shippingAddress });
    });

    it('debe listar pedidos del usuario', async () => {
      const res = await request(app)
        .get('/api/orders')
        .set('Cookie', authCookie)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.orders.length).toBe(1);
      expect(res.body.orders[0].usuario).toBe(String(testUser._id));
    });
  });
});