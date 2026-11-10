import { describe, expect, it, jest } from '@jest/globals';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';

// Se sustituye la referencia por un doble durante cada caso; la conexión real
// de tests/setup.js se restaura antes de que se limpien las colecciones.
const withConnection = async fn => {
  const original = mongoose.connections[0];
  const connection = { readyState: 0, host: 'prueba', asPromise: jest.fn() };
  mongoose.connections[0] = connection;
  try { await fn(connection); }
  finally { mongoose.connections[0] = original; jest.restoreAllMocks(); globalThis.__byJersMongoPromise = null; }
};

describe('Espera y recuperación de la conexión MongoDB', () => {
  it('dos peticiones concurrentes esperan la conexión en lugar de continuar en estado 2', async () => withConnection(async connection => {
    let resolve;
    const attempt = new Promise(r => { resolve = r; });
    const connect = jest.spyOn(mongoose, 'connect').mockImplementation(() => {
    connection.readyState = 2;
    return attempt;
    });
    let segundaTerminada = false;
    const first = connectDB();
    const second = connectDB().then(value => { segundaTerminada = true; return value; });
    await Promise.resolve();
    expect(segundaTerminada).toBe(false);
    resolve({ connection: mongoose.connection });
    await expect(first).resolves.toBe(mongoose.connection);
    await expect(second).resolves.toBe(mongoose.connection);
    expect(connect).toHaveBeenCalledTimes(1);
  }));

  it('vuelve a conectar tras una desconexión posterior a un intento exitoso', async () => withConnection(async connection => {
    const connect = jest.spyOn(mongoose, 'connect').mockImplementation(async () => {
    connection.readyState = 1;
    return { connection: mongoose.connection };
    });
    await connectDB();
    connection.readyState = 0;
    await connectDB();
    expect(connect).toHaveBeenCalledTimes(2);
  }));

  it('permite recuperar la conexión después de un fallo sin tumbar el proceso', async () => withConnection(async _connection => {
    const connect = jest.spyOn(mongoose, 'connect')
    .mockRejectedValueOnce(new Error('Base temporalmente no disponible'))
    .mockResolvedValueOnce({ connection: mongoose.connection });
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(connectDB({ allowRetry: true })).resolves.toBeNull();
    await expect(connectDB()).resolves.toBe(mongoose.connection);
    expect(connect).toHaveBeenCalledTimes(2);
  }));

  it('espera una conexión iniciada fuera de connectDB', async () => withConnection(async connection => {
    connection.readyState = 2;
    const waiting = jest.spyOn(mongoose.connection, 'asPromise').mockResolvedValue(mongoose.connection);
    const connect = jest.spyOn(mongoose, 'connect');
    await expect(connectDB()).resolves.toBe(mongoose.connection);
    expect(waiting).toHaveBeenCalledTimes(1);
    expect(connect).not.toHaveBeenCalled();
  }));
});
