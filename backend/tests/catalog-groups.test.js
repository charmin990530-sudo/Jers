import { beforeEach, describe, expect, it } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { Product, Category, Brand } from '../src/models/index.js';
import products from '../src/routes/products.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

const app = express();
app.use('/api/products', products);
app.use(errorHandler);

describe('Catálogo que consume Angular', () => {
  let categorias;
  beforeEach(async () => {
    categorias = await Category.create(['rostro', 'ojos', 'labios', 'shampoo', 'acondicionador', 'tratamientos'].map(nombre => ({ nombre })));
    const marca = await Brand.create({ nombre: 'Prueba catálogo' });
    await Product.init();
    await Product.create(categorias.map((categoria, i) => ({
      nombre: `${categoria.nombre} prueba`, descripcion: `Fórmula especial para ${categoria.nombre}`,
      precio: 10000 + i * 1000, stock: 10, categoria: categoria._id, marca: marca._id,
      imagenes: [{ url: '/img/placeholder.svg' }],
    })));
  });

  it.each([
    ['maquillaje', ['rostro prueba', 'ojos prueba', 'labios prueba']],
    ['cabello', ['shampoo prueba', 'acondicionador prueba', 'tratamientos prueba']],
  ])('devuelve únicamente las categorías del grupo %s', async (grupo, nombres) => {
    const res = await request(app).get(`/api/products/categoria/${grupo}`).expect(200);
    expect(res.body.total).toBe(3);
    expect(res.body.products.map(p => p.nombre).sort()).toEqual(nombres.sort());
  });

  it('mantiene la consulta por una categoría específica', async () => {
    const res = await request(app).get('/api/products/categoria/rostro').expect(200);
    expect(res.body.products.map(p => p.nombre)).toEqual(['rostro prueba']);
  });

  it('pagina y busca en todo el grupo, no solo en la primera página', async () => {
    const first = await request(app).get('/api/products/categoria/maquillaje?limit=1&sort=precio_asc').expect(200);
    const second = await request(app).get('/api/products/categoria/maquillaje?limit=1&page=2&sort=precio_asc').expect(200);
    expect(first.body.pages).toBe(3);
    expect(second.body.products[0]._id).not.toBe(first.body.products[0]._id);
    const found = await request(app).get('/api/products/categoria/maquillaje?search=labios').expect(200);
    expect(found.body.products.map(p => p.nombre)).toEqual(['labios prueba']);
    const outside = await request(app).get('/api/products/categoria/maquillaje?search=shampoo').expect(200);
    expect(outside.body.total).toBe(0);
  });

  it('oculta productos y categorías inactivos', async () => {
    await Category.updateOne({ nombre: 'ojos' }, { activo: false });
    await Product.updateOne({ nombre: 'labios prueba' }, { activo: false });
    const res = await request(app).get('/api/products/categoria/maquillaje').expect(200);
    expect(res.body.products.map(p => p.nombre)).toEqual(['rostro prueba']);
  });

  it('rechaza consultas inválidas y conserva el 404 de categorías desconocidas', async () => {
    await request(app).get('/api/products/categoria/maquillaje?page=0').expect(400);
    await request(app).get('/api/products/categoria/maquillaje?search=' + 'a'.repeat(101)).expect(400);
    await request(app).get('/api/products/categoria/desconocida').expect(404);
  });
});
