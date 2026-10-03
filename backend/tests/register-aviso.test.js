/**
 * A quién se avisa cuando alguien se registra con un correo que ya existe (B-02).
 *
 * POR QUÉ ESTE ARCHIVO ESTÁ SEPARADO DE `register-enumeracion.test.js`
 * ---------------------------------------------------------------------
 * Para comprobar a quién se manda el aviso hay que sustituir el servicio de correo,
 * y en ESM eso solo se puede hacer con `jest.unstable_mockModule` ANTES de que
 * nadie haya importado el módulo. Ese archivo importa `routes/index.js` de forma
 * estática al principio, que arrastra los controladores y con ellos el servicio de
 * correo, así que allí el mock ya llega tarde.
 *
 * La solución es un archivo aparte: cada archivo de test tiene su propio registro
 * de módulos, así que aquí se puede registrar el mock en la primera línea y
 * después importar todo con `await import()`. Sin `resetModules()`, que es lo que
 * rompía mongoose (es un singleton y el nuevo no hereda la conexión del anterior).
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';

const avisos = [];
let elAvisoFalla = false;

// El mock se registra antes de nada. Se reexporta el módulo real entero porque
// ordersController consume las plantillas de pedido de ahí, y si el mock solo
// declara dos exports el grafo de módulos revienta al enlazarse.
const emailServiceReal = await import('../src/services/emailService.js');
jest.unstable_mockModule('../src/services/emailService.js', () => ({
  ...emailServiceReal,
  sendDuplicateRegistrationEmail: async datos => {
    avisos.push(datos);
    // Para el caso de que SMTP se caiga, que tiene que dejar la respuesta igual.
    if (elAvisoFalla) throw new Error('SMTP caido');
  },
}));

const { routes } = await import('../src/routes/index.js');
const { notFound, errorHandler } = await import('../src/middleware/errorHandler.js');
const { User } = await import('../src/models/index.js');

const DATOS = {
  nombre: 'Intento',
  apellido: 'Ajeno',
  password: 'LaClaveDelAtacante1',
  telefono: '3000000000',
  aceptoTerminos: true,
  aceptoPrivacidad: true,
};

const crearTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/auth', routes.auth);
  app.use(notFound);
  app.use(errorHandler);
  return app;
};

const registrar = (app, email) => request(app).post('/api/auth/register').send({ ...DATOS, email });

let app;

beforeEach(async () => {
  app = crearTestApp();
  avisos.length = 0;
  elAvisoFalla = false;
  await User.deleteMany({});
});

describe('B-02: aviso al titular de la cuenta', () => {
  it('avisa a quien ya tiene la cuenta, no a quien intenta registrarse', async () => {
    await User.create({
      nombre: 'Titular',
      apellido: 'Real',
      email: 'titular@example.com',
      password: 'ClaveSegura123',
      aceptoTerminos: true,
      aceptoPrivacidad: true,
    });

    await registrar(app, 'titular@example.com');

    expect(avisos).toHaveLength(1);
    expect(avisos[0].to).toBe('titular@example.com');
    // El nombre es el de la cuenta existente, no el que escribió el intento.
    expect(avisos[0].nombre).toBe('Titular');
  });

  it('un correo nuevo no genera aviso: no hay nadie a quien avisar', async () => {
    await registrar(app, 'nadie@example.com');

    expect(avisos).toHaveLength(0);
  });

  it('reintentar el registro con el mismo correo avisa otra vez, y la cuenta no se duplica', async () => {
    await User.create({
      nombre: 'Titular',
      apellido: 'Real',
      email: 'reintento@example.com',
      password: 'ClaveSegura123',
      aceptoTerminos: true,
      aceptoPrivacidad: true,
    });

    await registrar(app, 'reintento@example.com');
    await registrar(app, 'reintento@example.com');

    expect(avisos).toHaveLength(2);
    await expect(User.countDocuments({ email: 'reintento@example.com' })).resolves.toBe(1);
  });

  it('que el aviso falle NO cambia la respuesta', async () => {
    // Si un fallo de SMTP se tradujera en un 500, ese 500 sería la señal que
    // permite enumerar: el correo nuevo devolvería 201 y el repetido, 500.
    await User.create({
      nombre: 'Titular',
      apellido: 'Real',
      email: 'smtp@example.com',
      password: 'ClaveSegura123',
      aceptoTerminos: true,
      aceptoPrivacidad: true,
    });

    elAvisoFalla = true;
    const originalError = console.error;
    console.error = () => {};
    let res;
    try {
      res = await registrar(app, 'smtp@example.com');
    } finally {
      console.error = originalError;
    }

    expect(res.status).toBe(201);
    expect(res.body.message).toContain('iniciar sesión');
  });
});
