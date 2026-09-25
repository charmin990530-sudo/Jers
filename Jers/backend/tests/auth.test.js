import { describe, it, expect, beforeEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { User } from '../src/models/index.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { JWT_SECRET, JWT_COOKIE_NAME } from '../src/config/env.js';
import { routes } from '../src/routes/index.js';
import { notFound, errorHandler } from '../src/middleware/errorHandler.js';

const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/auth', routes.auth);
  app.use(notFound);
  app.use(errorHandler);
  return app;
};

describe('Auth API', () => {
  let app;
  const testUser = {
    nombre: 'Test',
    apellido: 'User',
    email: 'test@example.com',
    password: 'password123',
    telefono: '3001234567',
    aceptoTerminos: true,
    aceptoPrivacidad: true
  };

  beforeEach(async () => {
    app = createTestApp();
    await User.deleteMany({});
  });

  describe('POST /api/auth/register', () => {
    it('debe registrar un usuario nuevo exitosamente', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send(testUser)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Registro exitoso. ¡Bienvenido a By Jers!');
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe(testUser.email);
      expect(res.body.user.nombre).toBe(testUser.nombre);
      expect(res.body.user.password).toBeUndefined();
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('debe fallar si el email ya existe', async () => {
      await User.create({
        ...testUser,
        password: await bcrypt.hash(testUser.password, 12)
      });

      const res = await request(app)
        .post('/api/auth/register')
        .send(testUser)
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('EMAIL_EXISTS');
    });

    it('debe fallar con datos inválidos (validación Zod)', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'invalid', password: '123' })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.errors).toBeDefined();
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      // Use register endpoint to create user properly (handles password hashing)
      await request(app)
        .post('/api/auth/register')
        .send(testUser);
    });

    it('debe loguear usuario con credenciales correctas', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: testUser.email, password: testUser.password })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Inicio de sesión exitoso');
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe(testUser.email);
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('debe fallar con contraseña incorrecta', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: testUser.email, password: 'wrongpassword' })
        .expect(401);

      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
    });

    it('debe fallar con email inexistente', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nonexistent@example.com', password: testUser.password })
        .expect(401);

      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('GET /api/auth/me', () => {
    let authCookie;

    beforeEach(async () => {
      const hashedPassword = await bcrypt.hash(testUser.password, 12);
      const user = await User.create({ ...testUser, password: hashedPassword });
      
      const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });
      authCookie = `${JWT_COOKIE_NAME}=${token}`;
    });

    it('debe retornar usuario autenticado con cookie válida', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', authCookie)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.user.email).toBe(testUser.email);
      expect(res.body.user.password).toBeUndefined();
    });

    it('debe fallar sin cookie', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .expect(401);

      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('UNAUTHENTICATED');
    });

    it('debe fallar con token inválido', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', `${JWT_COOKIE_NAME}=invalidtoken`)
        .expect(401);

      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('INVALID_TOKEN');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('debe limpiar la cookie', async () => {
      const res = await request(app)
        .post('/api/auth/logout')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Sesión cerrada correctamente');
      const cookie = res.headers['set-cookie'][0];
      expect(cookie).toContain('Max-Age=0');
    });
  });
});