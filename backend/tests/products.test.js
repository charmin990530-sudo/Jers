import { describe, it, expect, beforeEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { Product, Category, Brand } from '../src/models/index.js';
import { routes } from '../src/routes/index.js';
import { notFound, errorHandler } from '../src/middleware/errorHandler.js';

const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/products', routes.products);
  app.use(notFound);
  app.use(errorHandler);
  return app;
};

describe('Products API', () => {
  let app;
  let testCategory, testBrand;

  beforeEach(async () => {
    app = createTestApp();
    await Product.deleteMany({});
    await Category.deleteMany({});
    await Brand.deleteMany({});

    testCategory = await Category.create({
      nombre: 'rostro',
      slug: 'rostro',
      descripcion: 'Productos para rostro',
      orden: 1
    });

    testBrand = await Brand.create({
      nombre: 'Test Brand',
      slug: 'test-brand',
      descripcion: 'Marca de prueba'
    });
  });

  describe('GET /api/products', () => {
    beforeEach(async () => {
      await Product.create([
        {
          nombre: 'Base Test 1',
          slug: 'base-test-1',
          descripcion: 'Base de prueba 1',
          precio: 50000,
          stock: 10,
          categoria: testCategory._id,
          marca: testBrand._id,
          imagenes: [{ url: 'https://example.com/img1.jpg', esPrincipal: true }],
          destacado: true,
          sku: 'TEST-BASE-001'
        },
        {
          nombre: 'Base Test 2',
          slug: 'base-test-2',
          descripcion: 'Base de prueba 2',
          precio: 60000,
          precioAnterior: 70000,
          stock: 5,
          categoria: testCategory._id,
          marca: testBrand._id,
          imagenes: [{ url: 'https://example.com/img2.jpg', esPrincipal: true }],
          enPromocion: true,
          sku: 'TEST-BASE-002'
        }
      ]);
    });

    it('debe retornar lista paginada de productos', async () => {
      const res = await request(app)
        .get('/api/products')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.products).toBeDefined();
      expect(res.body.products.length).toBe(2);
      expect(res.body.total).toBe(2);
      expect(res.body.page).toBe(1);
      expect(res.body.pages).toBe(1);
    });

    it('debe filtrar por categoría', async () => {
      const res = await request(app)
        .get(`/api/products?categoria=${testCategory._id}`)
        .expect(200);

      expect(res.body.products.length).toBe(2);
      expect(res.body.products[0].categoria._id).toBe(String(testCategory._id));
    });

    it('debe filtrar por enPromocion', async () => {
      const res = await request(app)
        .get('/api/products?enPromocion=true')
        .expect(200);

      expect(res.body.products.length).toBe(1);
      expect(res.body.products[0].enPromocion).toBe(true);
    });

    it('debe buscar por texto', async () => {
      const res = await request(app)
        .get('/api/products?search=Base Test 1')
        .expect(200);

      // Text search encuentra ambos productos porque ambos contienen "Base Test"
      expect(res.body.products.length).toBeGreaterThanOrEqual(1);
      const found = res.body.products.find(p => p.nombre === 'Base Test 1');
      expect(found).toBeDefined();
    });
  });

  describe('GET /api/products/featured', () => {
    it('debe retornar solo productos destacados', async () => {
      await Product.create([
        {
          nombre: 'Producto Destacado',
          slug: 'producto-destacado',
          descripcion: 'Es destacado',
          precio: 50000,
          stock: 10,
          categoria: testCategory._id,
          marca: testBrand._id,
          imagenes: [{ url: 'https://example.com/img.jpg', esPrincipal: true }],
          destacado: true,
          sku: 'TEST-FEATURED-001'
        },
        {
          nombre: 'Producto Normal',
          slug: 'producto-normal',
          descripcion: 'No es destacado',
          precio: 50000,
          stock: 10,
          categoria: testCategory._id,
          marca: testBrand._id,
          imagenes: [{ url: 'https://example.com/img.jpg', esPrincipal: true }],
          destacado: false,
          sku: 'TEST-NORMAL-001'
        }
      ]);

      const res = await request(app)
        .get('/api/products/featured')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.products.length).toBe(1);
      expect(res.body.products[0].destacado).toBe(true);
    });
  });

  describe('GET /api/products/promociones', () => {
    it('debe retornar solo productos en promoción', async () => {
      await Product.create([
        {
          nombre: 'Producto Promo',
          slug: 'producto-promo',
          descripcion: 'En promo',
          precio: 40000,
          precioAnterior: 50000,
          stock: 10,
          categoria: testCategory._id,
          marca: testBrand._id,
          imagenes: [{ url: 'https://example.com/img.jpg', esPrincipal: true }],
          enPromocion: true,
          sku: 'TEST-PROMO-001'
        },
        {
          nombre: 'Producto Normal',
          slug: 'producto-normal',
          descripcion: 'No en promo',
          precio: 50000,
          stock: 10,
          categoria: testCategory._id,
          marca: testBrand._id,
          imagenes: [{ url: 'https://example.com/img.jpg', esPrincipal: true }],
          sku: 'TEST-NORMAL-002'
        }
      ]);

      const res = await request(app)
        .get('/api/products/promociones')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.products.length).toBe(1);
      expect(res.body.products[0].enPromocion).toBe(true);
    });
  });

  describe('GET /api/products/categorias', () => {
    it('debe retornar categorías activas ordenadas', async () => {
      const res = await request(app)
        .get('/api/products/categorias')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.categories.length).toBeGreaterThan(0);
      expect(res.body.categories[0].nombre).toBe('rostro');
    });
  });

  describe('GET /api/products/marcas', () => {
    it('debe retornar marcas activas ordenadas', async () => {
      const res = await request(app)
        .get('/api/products/marcas')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.brands.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/products/:id', () => {
    let productId;

    beforeEach(async () => {
      const product = await Product.create({
        nombre: 'Test Product',
        slug: 'test-product',
        descripcion: 'Producto de prueba',
        precio: 50000,
        stock: 10,
        categoria: testCategory._id,
        marca: testBrand._id,
        imagenes: [{ url: 'https://example.com/img.jpg', esPrincipal: true }],
        sku: 'TEST-ID-001'
      });
      productId = product._id;
    });

    it('debe retornar producto por ID', async () => {
      const res = await request(app)
        .get(`/api/products/${productId}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.product._id).toBe(String(productId));
      expect(res.body.product.nombre).toBe('Test Product');
      expect(res.body.product.descuentoPorcentaje).toBeDefined();
      expect(res.body.product.imagenPrincipal).toBeDefined();
    });

    it('debe fallar con ID inexistente', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const res = await request(app)
        .get(`/api/products/${fakeId}`)
        .expect(404);

      expect(res.body.error).toBeDefined();
      expect(res.body.success).toBeUndefined();
      expect(res.body.error.code).toBe('PRODUCT_NOT_FOUND');
    });
  });
});