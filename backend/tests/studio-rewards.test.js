import { beforeEach, afterEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { routes } from '../src/routes/index.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { JWT_COOKIE_NAME, JWT_SECRET, TAX_RATE_BP } from '../src/config/env.js';
import { Cart, Order, Product, User } from '../src/models/index.js';
import GameReward from '../src/models/GameReward.js';
import GameAttempt from '../src/models/GameAttempt.js';
import { makeupRules, cosmeticType } from '../src/services/gameRules.js';
import { grantReward } from '../src/services/gameRewards.js';
import { taxFor } from '../src/services/money.js';

const app = express();
app.use(express.json(), cookieParser());
for (const [name, router] of Object.entries(routes)) app.use('/api/' + name, router);
app.use(errorHandler);
const direccionEnvio = { alias: 'Casa', nombreCompleto: 'Persona Ficticia', telefono: '3000000000', direccion: 'Calle ficticia 10', ciudad: 'Bogotá', departamento: 'Cundinamarca' };
let user, cookie, lipstick, other;
const makeProduct = extra => Product.create({ nombre: 'Labial de prueba', descripcion: 'Producto ficticio del entorno temporal', precio: 50000, stock: 20, categoria: '507f1f77bcf86cd799439011', marca: '507f1f77bcf86cd799439012', imagenes: [{ url: '/img/placeholder.svg' }], ...extra });
beforeEach(async () => {
  await GameReward.init(); await GameAttempt.init();
  user = await User.create({ nombre: 'Persona', apellido: 'Ficticia', email: 'studio@example.com', password: 'FicticiaStudio2026!' });
  cookie = `${JWT_COOKIE_NAME}=${jwt.sign({ id: user.id, ver: 0 }, JWT_SECRET)}`;
  lipstick = await makeProduct(); other = await makeProduct({ nombre: 'Shampoo ficticio', precio: 100000 });
});
afterEach(() => jest.restoreAllMocks());
const req = (method, url) => request(app)[method](url).set('Cookie', cookie);
const add = (product, cantidad = 1) => req('post', '/api/cart').send({ productoId: product.id, cantidad }).expect(200);
const start = async (challenge = 'natural') => (await req('post', '/api/studio/attempts').send({ challenge }).expect(201)).body.attempt;
const applyStep = (attempt, option) => req('patch', `/api/studio/attempts/${attempt.id}/step`).send({ revision: attempt.revision, category: option.category, option });

describe('Juego, premios y compras reales en MongoDB temporal', () => {
  it('ofrece productos sin cuenta, pero no permite crear premios anónimos', async () => {
    const response = await request(app).get('/api/studio/products').expect(200);
    expect(response.body.products.map(p => p._id)).toContain(lipstick.id);
    await request(app).post('/api/studio/attempts').send({ challenge: 'natural' }).expect(401);
    expect(await GameReward.countDocuments()).toBe(0);
  });
  it('distingue labiales de gloss y delineadores de labios', () => {
    expect(cosmeticType({ nombre: 'Labial Mate Larga Duración' })).toBe('labios');
    expect(cosmeticType({ nombre: 'Brillo labial hidratante' })).toBeNull();
    expect(cosmeticType({ nombre: 'Delineador de labios' })).toBeNull();
    expect(cosmeticType({ nombre: 'Delineador en gel' })).toBe('delineado');
  });
  it('solo concede el premio por jugar tras una aplicación válida y conserva pasos sin el look', async () => {
    const attempt = await start();
    expect(await GameReward.countDocuments()).toBe(0);
    await applyStep(attempt, { category: 'labios', shade: 'nude', intensity: 40 }).expect(200);
    expect(await GameReward.countDocuments({ usuario: user.id, kind: 'play-lips' })).toBe(1);
    const saved = await GameAttempt.findById(attempt.id).lean();
    expect(saved.steps).toEqual(['labios']);
    expect(saved.options).toBeUndefined(); expect(saved.image).toBeUndefined(); expect(saved.shade).toBeUndefined();
  });
  it('rechaza colores, porcentajes, campos extra y una revisión obsoleta', async () => {
    const attempt = await start();
    for (const option of [
      { category: 'labios', shade: 'ink', intensity: 40 },
      { category: 'labios', shade: 'nude', intensity: 101 },
      { category: 'labios', shade: 'nude', intensity: 50, won: true },
    ]) await applyStep(attempt, option).expect(400);
    await applyStep(attempt, { category: 'labios', shade: 'nude', intensity: 40 }).expect(200);
    await applyStep(attempt, { category: 'labios', shade: 'nude', intensity: 50 }).expect(409);
    expect(await GameReward.countDocuments()).toBe(1);
  });
  it('deshacer o quitar un paso impide terminar el reto', async () => {
    const attempt = await start();
    const response = await applyStep(attempt, { category: 'labios', shade: 'nude', intensity: 40 }).expect(200);
    await req('patch', `/api/studio/attempts/${attempt.id}/step`).send({ revision: response.body.revision, category: 'labios', option: null }).expect(200);
    await req('post', `/api/studio/attempts/${attempt.id}/complete`).send({}).expect(400);
    expect(await GameReward.countDocuments({ kind: 'win-store' })).toBe(0);
  });
  it.each(['natural', 'noche', 'editorial'])('valida los cuatro pasos de %s en el servidor y no duplica premios', async challengeId => {
    const attempt = await start(challengeId);
    const challenge = makeupRules.challenges.find(c => c.id === challengeId);
    for (const step of challenge.steps) {
      const response = await applyStep(attempt, { category: step.category, shade: step.shades[0], intensity: Math.ceil((step.min + step.max) / 2) }).expect(200);
      attempt.revision = response.body.revision;
    }
    for (let i = 0; i < 2; i++) {
      const response = await req('post', `/api/studio/attempts/${attempt.id}/complete`).send({}).expect(200);
      expect(response.body.won).toBe(true); expect(response.body.rewards).toHaveLength(2);
    }
    expect(await GameReward.countDocuments({ usuario: user.id })).toBe(2);
  });
  it('el modo libre termina con una capa y no concede el premio de ganar', async () => {
    const attempt = await start('libre');
    await applyStep(attempt, { category: 'rubor', shade: 'rose', intensity: 40 }).expect(200);
    const response = await req('post', `/api/studio/attempts/${attempt.id}/complete`).send({}).expect(200);
    expect(response.body.won).toBe(false); expect(response.body.rewards).toHaveLength(1);
  });
  it('la creación concurrente del mismo premio conserva un único documento', async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => grantReward(user.id, 'play-lips', 'libre')));
    expect(new Set(results.map(r => String(r._id))).size).toBe(1);
  });
  it('una cuenta no puede consultar ni completar la sesión de otra', async () => {
    const attempt = await start();
    const otherUser = await User.create({ nombre: 'Otra', apellido: 'Persona', email: 'other-studio@example.com', password: 'FicticiaStudio2026!' });
    const otherCookie = `${JWT_COOKIE_NAME}=${jwt.sign({ id: otherUser.id, ver: 0 }, JWT_SECRET)}`;
    await request(app).post(`/api/studio/attempts/${attempt.id}/complete`).set('Cookie', otherCookie).send({}).expect(404);
  });
  it('el 10% de participación afecta solo a labiales, con IVA recalculado y cotización igual al pedido', async () => {
    const reward = await grantReward(user.id, 'play-lips', 'libre');
    await add(lipstick); await add(other);
    const quote = await req('get', `/api/cart?rewardId=${reward.id}`).expect(200);
    const cart = quote.body.cart;
    expect(cart.subtotal).toBe(150000); expect(cart.descuento).toBe(5000);
    expect(cart.impuestos).toBe(taxFor(145000 + cart.costoEnvio, TAX_RATE_BP));
    const response = await req('post', '/api/orders').send({ direccionEnvio, expectedTotal: cart.total, rewardId: reward.id }).expect(201);
    expect(response.body.order.total).toBe(cart.total); expect(response.body.order.descuento).toBe(5000);
    expect((await GameReward.findById(reward.id)).redeemedAt).not.toBeNull();
  });
  it('el premio de tienda exige superar, no igualar, $150.000 antes de envío e IVA', async () => {
    const reward = await grantReward(user.id, 'win-store', 'natural');
    await add(lipstick); await add(other);
    await req('get', `/api/cart?rewardId=${reward.id}`).expect(400);
    await Product.updateOne({ _id: other.id }, { $set: { precio: 100001 } });
    const quote = await req('get', `/api/cart?rewardId=${reward.id}`).expect(200);
    expect(quote.body.cart.descuento).toBe(15000);
    expect((await GameReward.findById(reward.id)).redeemedAt).toBeNull();
  });
  it('rechaza premios ajenos y parámetros de consulta con operadores', async () => {
    const otherUser = await User.create({ nombre: 'Otra', apellido: 'Persona', email: 'other-reward@example.com', password: 'FicticiaStudio2026!' });
    const reward = await grantReward(otherUser.id, 'play-lips', 'libre');
    await add(lipstick);
    await req('get', `/api/cart?rewardId=${reward.id}`).expect(409);
    await req('get', '/api/cart?rewardId[$ne]=null').expect(400);
    await req('post', '/api/orders').send({ direccionEnvio, rewardId: reward.id }).expect(409);
    expect(await Order.countDocuments()).toBe(0);
  });
  it('no aplica el descuento de labiales a un carrito que solo tiene otros productos', async () => {
    const reward = await grantReward(user.id, 'play-lips', 'libre');
    await add(other);
    await req('get', `/api/cart?rewardId=${reward.id}`).expect(400);
  });
  it('un fallo al crear el pedido revierte la reserva de premio e inventario', async () => {
    const reward = await grantReward(user.id, 'play-lips', 'libre');
    await add(lipstick);
    jest.spyOn(Order, 'create').mockRejectedValueOnce(new Error('Fallo ficticio de escritura'));
    await req('post', '/api/orders').send({ direccionEnvio, rewardId: reward.id }).expect(500);
    expect((await GameReward.findById(reward.id)).redeemedAt).toBeNull();
    expect((await Product.findById(lipstick.id)).stock).toBe(20);
    expect(await Cart.countDocuments({ usuario: user.id })).toBe(1);
  });
  it('un premio se consume una sola vez y el reintento idempotente conserva el descuento', async () => {
    const reward = await grantReward(user.id, 'play-lips', 'libre'); await add(lipstick);
    const send = () => req('post', '/api/orders').set('Idempotency-Key', 'studio-order-ficticio-2026').send({ direccionEnvio, rewardId: reward.id });
    const responses = await Promise.all([send(), send()]);
    expect(responses.map(r => r.status).sort()).toEqual([200, 201]);
    expect(responses[0].body.order).toEqual(responses[1].body.order);
    expect(await Order.countDocuments()).toBe(1);
    await add(lipstick);
    await req('post', '/api/orders').send({ direccionEnvio, rewardId: reward.id }).expect(409);
  });
});
