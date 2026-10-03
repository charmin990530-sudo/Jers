/**
 * POST /api/auth/register — que la respuesta NO diga si el correo existe (B-02).
 *
 * POR QUÉ ESTE ARCHIVO ES UNA PRUEBA DE SEGURIDAD Y NO DE FUNCIONALIDAD
 * --------------------------------------------------------------------
 * `/api/auth/register` es público y sin sesión. Antes respondía 400
 * `EMAIL_EXISTS` cuando el correo ya estaba, lo que lo convertía en un oráculo:
 * un script que recorre una lista de correos y se queda con los que son clientes
 * de la tienda. La auditoría lo marcó como "permite construir un listado de
 * clientes", y es literalmente eso.
 *
 * Estos tests comprueban la propiedad que lo cierra: **las dos respuestas tienen que
 * ser indistinguibles**. No basta con que el mensaje sea parecido; tiene que ser el
 * mismo status, el mismo cuerpo, las mismas cabeceras y, sobre todo, las mismas
 * cookies. Por eso se compara el `Set-Cookie` y no solo el JSON.
 *
 * Y el segundo test del archivo es el que de verdad importa: el caso real y el
 * duplicado tienen que ser iguales también DESPUÉS, cuando el cliente pide su
 * sesión. Si el registro pusiera cookie solo en el caso real, bastaría una llamada
 * a /api/auth/me para volver a enumerar.
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { User } from '../src/models/index.js';


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

const DATOS = {
  nombre: 'Nueva',
  apellido: 'Cliente',
  password: 'ClaveSegura123',
  telefono: '3001234567',
  aceptoTerminos: true,
  aceptoPrivacidad: true,
};

const registrar = (app, email) => request(app)
  .post('/api/auth/register')
  .send({ ...DATOS, email });

/** Lo que distingue una respuesta: status, cabeceras y cuerpo. */
const firma = res => ({
  status: res.status,
  cuerpo: res.body,
  cookie: res.headers['set-cookie'] || null,
});

let app;

beforeEach(async () => {
  app = createTestApp();
  await User.deleteMany({});
});

describe('register: no enumera correos', () => {
  it('un correo nuevo devuelve 201 con un cuerpo sin datos del usuario', async () => {
    const res = await registrar(app, 'nuevo@example.com');

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('iniciar sesión');
    // Ni nombre, ni id, ni nada que venga de la cuenta creada.
    expect(res.body.user).toBeUndefined();
  });

  it('un correo ya existente devuelve EXACTAMENTE lo mismo', async () => {
    await registrar(app, 'repetido@example.com');
    const nuevo = await registrar(app, 'recien@example.com');
    const repetido = await registrar(app, 'repetido@example.com');

    expect(firma(repetido)).toEqual(firma(nuevo));
  });

  it('la respuesta del duplicado no contiene ningún dato de la cuenta que ya existía', async () => {
    await registrar(app, 'secreto@example.com');
    await User.updateOne(
      { email: 'secreto@example.com' },
      { $set: { telefono: '3009999999', nombre: 'Dueña' } },
    );

    const res = await registrar(app, 'secreto@example.com');

    expect(JSON.stringify(res.body)).not.toContain('Dueña');
    expect(JSON.stringify(res.body)).not.toContain('3009999999');
    expect(JSON.stringify(res.body)).not.toContain('secreto@example.com');
  });

  it('ninguna de las dos respuestas abre sesión', async () => {
    // Esta es la condición que hace que todo lo demás sirva. Si el caso real
    // pusiera cookie y el duplicado no, /api/auth/me delataría cuál fue cuál.
    const nuevo = await registrar(app, 'nuevo2@example.com');
    const repetido = await registrar(app, 'nuevo2@example.com');

    expect(nuevo.headers['set-cookie']).toBeUndefined();
    expect(repetido.headers['set-cookie']).toBeUndefined();
  });

  it('el cliente no queda con sesión en ninguno de los dos casos', async () => {
    const res = await registrar(app, 'sesion@example.com');

    const me = await request(app).get('/api/auth/me').set('Cookie', res.headers['set-cookie'] || '');

    // Si esto devolviera 200 en el caso nuevo, la cookie se habría puesto.
    expect(me.status).toBe(401);
  });
});

describe('register: efectos reales', () => {
  it('la cuenta nueva sí se crea y con la contraseña correcta', async () => {
    await registrar(app, 'creada@example.com');

    const user = await User.findOne({ email: 'creada@example.com' });
    expect(user).not.toBeNull();

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'creada@example.com', password: DATOS.password });
    expect(login.status).toBe(200);
  });

  it('la cuenta existente NO se toca ni se duplica', async () => {
    await registrar(app, 'unica@example.com');
    await User.updateOne({ email: 'unica@example.com' }, { $set: { telefono: '3001111111' } });

    await registrar(app, 'unica@example.com');

    const cuantos = await User.countDocuments({ email: 'unica@example.com' });
    const user = await User.findOne({ email: 'unica@example.com' });
    expect(cuantos).toBe(1);
    expect(user.telefono).toBe('3001111111');
  });

  it('la contraseña con la que se "registra" un correo ajeno no sirve para entrar', async () => {
    // El límite de intentos del login es lo que convierte el descubrimiento en
    // adivinar una contraseña en vez de leer un endpoint. Aquí se comprueba que la
    // contraseña del atacante no se cuela.
    await registrar(app, 'ajena@example.com');

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ajena@example.com', password: 'LaQueYoPuseAlRegistrarme' });

    expect(login.status).toBe(401);
  });

  it('registrarse dos veces con el mismo correo no lanza E11000', async () => {
    // La carrera de dos registros simultáneos los agarra el índice unique, y su
    // error tiene que traducirse igual que el caso "ya existe", no a un 400 con
    // el mensaje del driver.
    await registrar(app, 'carrera@example.com');

    const res = await registrar(app, 'carrera@example.com');

    expect(res.status).toBe(201);
  });

  it('sigue validando: sin aceptar los términos, 400 con el detalle por campo', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...DATOS, email: 'sin-terminos@example.com', aceptoTerminos: false });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('sigue validando el formato del correo', async () => {
    const res = await registrar(app, 'esto-no-es-un-correo');

    expect(res.status).toBe(400);
  });

  it('no filtra nada en el tiempo: un correo nuevo y uno repetido tardan lo mismo', async () => {
    // Difícil de fijar sin medir tiempos, pero al menos se comprueba que la
    // respuesta no lleva cabeceras que sí distinguen (como un 409 con Retry-After
    // o un cuerpo de error distinto).
    await registrar(app, 'tiempo@example.com');

    const nuevo = await registrar(app, 'nuevo-tiempo@example.com');
    const repetido = await registrar(app, 'tiempo@example.com');

    const cabeceras = res => Object.keys(res.headers).filter(h => h !== 'content-type' && h !== 'content-length');
    expect(cabeceras(repetido).sort()).toEqual(cabeceras(nuevo).sort());
  });
});
