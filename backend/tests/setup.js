import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { resetTransactionSupportCache } from '../src/services/transaction.js';

// Limites de peticiones relajados ANTES de que se importe config/env.js.
// dotenv no sobreescribe variables ya presentes, asi que estos valores ganan.
//
// Sin esto, `beforeEach` registra un usuario nuevo por test y el limitador de
// /api/auth/* (5 por minuto en local) devuelve 429 a partir del quinto test. El
// fallo aparece como "Expected 201, Received 429" y esconde el motivo real.
process.env.RATE_LIMIT_MAX_REQUESTS = process.env.RATE_LIMIT_MAX_REQUESTS || '100000';
process.env.AUTH_RATE_LIMIT_MAX_REQUESTS = process.env.AUTH_RATE_LIMIT_MAX_REQUESTS || '100000';
process.env.CONTACT_RATE_LIMIT_MAX_REQUESTS = process.env.CONTACT_RATE_LIMIT_MAX_REQUESTS || '100000';

let mongoServer;

export const connectTestDB = async () => {
  // Un replica set de un solo nodo, no un MongoMemoryServer plano: el proyecto
  // usa transacciones para crear y cancelar pedidos, y un servidor standalone las
  // rechaza con "Transaction numbers are only allowed on a replica set member".
  // Con standalone, los tests exercised el camino de compensacion y nunca el de
  // verdad, que es justo el que no puede fallar en produccion sin que nadie se
  // entere. Ademas MongoMemoryServer.create({replSet}) NO replica el conjunto
  // (setName llega undefined) y hay que usar MongoMemoryReplSet.
  mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongoServer.getUri());
  resetTransactionSupportCache();
};

export const closeTestDB = async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  await mongoServer.stop();
};

export const clearTestDB = async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
};

// La PRIMERA vez que se corren los tests, MongoMemoryReplSet descarga el binario
// de mongod (~220 MB) y eso no cabe en los 10 s de testTimeout. Se le da su propio
// margen a este hook en vez de subir el timeout global, para no esconder tests
// colgados de verdad. Runs posteriores usan el binario cacheado (~1 s).
const BOOTSTRAP_TIMEOUT_MS = 180000;

beforeAll(async () => {
  await connectTestDB();
}, BOOTSTRAP_TIMEOUT_MS);

afterAll(async () => {
  await closeTestDB();
}, BOOTSTRAP_TIMEOUT_MS);

afterEach(async () => {
  await clearTestDB();
});