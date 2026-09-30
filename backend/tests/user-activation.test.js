/**
 * PATCH /api/users/:id/toggle-active — activacion de cuentas por el admin.
 *
 * POR QUE EXISTE ESTE ARCHIVO
 * ---------------------------
 * Este endpoint nunca tuvo test, y es el que gobierna quién puede comprar en la
 * tienda: desactivar a un usuario le cierra la puerta (authenticate() rechaza las
 * cuentas inactivas). Tres reglas se protegían solo por lectura del código:
 *
 *  1. Un admin no puede desactivar su propia cuenta (se quedaria fuera del
 *     panel sin poder reentrar).
 *  2. No puede quedar la tienda sin ningún administrador activo.
 *  3. `activo` explicito en el cuerpo se respetaba en el esquema Zod pero se
 *     ignoraba en el controlador: quien mandara {activo:false} sobre un usuario
 *     ya inactivo lo ACTIVABA, al reves de lo pedido.
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { User } from '../src/models/index.js';
import { routes } from '../src/routes/index.js';
import { notFound, errorHandler } from '../src/middleware/errorHandler.js';
import { JWT_SECRET, JWT_COOKIE_NAME } from '../src/config/env.js';

const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/users', routes.users);
  app.use(notFound);
  app.use(errorHandler);
  return app;
};

const crearUsuario = (overrides = {}) => User.create({
  nombre: 'Usuario',
  apellido: 'Prueba',
  email: `u${Math.random().toString(36).slice(2, 9)}@example.com`,
  password: bcrypt.hashSync('ClaveSegura123', 12),
  aceptoTerminos: true,
  aceptoPrivacidad: true,
  ...overrides,
});

const cookieDe = user => `${JWT_COOKIE_NAME}=${jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' })}`;

describe('toggle-active: activacion de usuarios', () => {
  let app;
  let admin;

  beforeEach(async () => {
    app = createTestApp();
    await User.deleteMany({});
    admin = await crearUsuario({ role: 'admin' });
  });

  describe('autorizacion', () => {
    it('exige sesion', async () => {
      const objetivo = await crearUsuario();
      const res = await request(app).patch(`/api/users/${objetivo._id}/toggle-active`).send({});
      expect(res.status).toBe(401);
    });

    it('rechaza a un usuario normal', async () => {
      const normal = await crearUsuario({ role: 'user' });
      const objetivo = await crearUsuario();
      const res = await request(app)
        .patch(`/api/users/${objetivo._id}/toggle-active`)
        .set('Cookie', cookieDe(normal))
        .send({});
      expect(res.status).toBe(403);
    });
  });

  describe('alternar (cuerpo vacio, el comportamiento heredado)', () => {
    it('desactiva un usuario activo', async () => {
      const objetivo = await crearUsuario({ activo: true });
      const res = await request(app)
        .patch(`/api/users/${objetivo._id}/toggle-active`)
        .set('Cookie', cookieDe(admin))
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.user.activo).toBe(false);
      expect((await User.findById(objetivo._id)).activo).toBe(false);
    });

    it('reactiva un usuario inactivo', async () => {
      const objetivo = await crearUsuario({ activo: false });
      const res = await request(app)
        .patch(`/api/users/${objetivo._id}/toggle-active`)
        .set('Cookie', cookieDe(admin))
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.user.activo).toBe(true);
      expect((await User.findById(objetivo._id)).activo).toBe(true);
    });
  });

  describe('valor explicito (lo que el esquema promete y el controlador ignoraba)', () => {
    it('{activo:false} desactiva un usuario que sigue activo', async () => {
      const objetivo = await crearUsuario({ activo: true });
      const res = await request(app)
        .patch(`/api/users/${objetivo._id}/toggle-active`)
        .set('Cookie', cookieDe(admin))
        .send({ activo: false });

      expect(res.status).toBe(200);
      expect((await User.findById(objetivo._id)).activo).toBe(false);
    });

    // Esta es la regresion concreta: con el controlador viejo, {activo:false}
    // sobre un usuario ya inactivo lo ACTIVABA, porque hacia siempre el toggle.
    it('{activo:false} sobre un usuario YA inactivo lo deja inactivo', async () => {
      const objetivo = await crearUsuario({ activo: false });
      const res = await request(app)
        .patch(`/api/users/${objetivo._id}/toggle-active`)
        .set('Cookie', cookieDe(admin))
        .send({ activo: false });

      expect(res.status).toBe(200);
      expect(res.body.user.activo).toBe(false);
      expect((await User.findById(objetivo._id)).activo).toBe(false);
    });

    it('{activo:true} sobre un usuario YA activo lo deja activo', async () => {
      const objetivo = await crearUsuario({ activo: true });
      const res = await request(app)
        .patch(`/api/users/${objetivo._id}/toggle-active`)
        .set('Cookie', cookieDe(admin))
        .send({ activo: true });

      expect(res.status).toBe(200);
      expect((await User.findById(objetivo._id)).activo).toBe(true);
    });
  });

  describe('protecciones', () => {
    it('un admin no puede desactivar su propia cuenta', async () => {
      const res = await request(app)
        .patch(`/api/users/${admin._id}/toggle-active`)
        .set('Cookie', cookieDe(admin))
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('SELF_DEACTIVATE');
      expect((await User.findById(admin._id)).activo).toBe(true);
    });

    it('tampoco con {activo:false} explicito', async () => {
      const res = await request(app)
        .patch(`/api/users/${admin._id}/toggle-active`)
        .set('Cookie', cookieDe(admin))
        .send({ activo: false });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('SELF_DEACTIVATE');
      expect((await User.findById(admin._id)).activo).toBe(true);
    });

    // LAST_ADMIN no puede dispararse en este endpoint, y el test lo documenta
    // en vez de fingir un escenario imposible. Razon: para llegar aqui el actor
    // tiene que ser un admin ACTIVO (lo exigen `authenticate`, que rechaza las
    // cuentas inactivas, y `authorize('admin')`). Si el objetivo es el propio
    // actor, salta antes SELF_DEACTIVATE. Si es otro, el actor sigue contando
    // como admin activo, asi que `activeAdminCount(objetivo)` es >= 1 y la
    // comparacion con 0 jamas se cumple. La garantia real de "no quedarse sin
    // admins" la aporta SELF_DEACTIVATE.
    it('un admin puede desactivar a otro admin mientras quede uno activo', async () => {
      const otroAdmin = await crearUsuario({ role: 'admin' });
      const res = await request(app)
        .patch(`/api/users/${otroAdmin._id}/toggle-active`)
        .set('Cookie', cookieDe(admin))
        .send({ activo: false });

      expect(res.status).toBe(200);
      expect((await User.findById(otroAdmin._id)).activo).toBe(false);
      // El que sigue activo es el que actuo, no el que se desactivo.
      expect((await User.findById(admin._id)).activo).toBe(true);
    });

    it('un admin inactivo si puede reactivarse a si mismo', async () => {
      // Si esta garantia se aplicara siempre, un admin desactivado por otro
      // no podria volver a entrar nunca. La guarda es contra la autodesactivacion
      // desde una cuenta activa, no un cierre permanent.
      const caido = await crearUsuario({ role: 'admin', activo: false });
      const res = await request(app)
        .patch(`/api/users/${caido._id}/toggle-active`)
        .set('Cookie', cookieDe(admin))
        .send({ activo: true });

      expect(res.status).toBe(200);
      expect((await User.findById(caido._id)).activo).toBe(true);
    });

    it('un usuario normal inactivo si puede reactivarse a si mismo', async () => {
      const caido = await crearUsuario({ role: 'user', activo: false });
      const res = await request(app)
        .patch(`/api/users/${caido._id}/toggle-active`)
        .set('Cookie', cookieDe(admin))
        .send({ activo: true });

      expect(res.status).toBe(200);
      expect((await User.findById(caido._id)).activo).toBe(true);
    });

    it('rechaza un cuerpo con campos desconocidos', async () => {
      // El esquema es .strict(): un cliente que mande role junto a activo no debe
      // poder colar un cambio de privilegios por esta puerta.
      const objetivo = await crearUsuario({ activo: true });
      const res = await request(app)
        .patch(`/api/users/${objetivo._id}/toggle-active`)
        .set('Cookie', cookieDe(admin))
        .send({ activo: false, role: 'admin' });

      expect(res.status).toBe(400);
      expect((await User.findById(objetivo._id)).role).toBe('user');
    });
  });
});
