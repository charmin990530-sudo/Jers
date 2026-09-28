/**
 * db.js - Conexión a MongoDB usando Mongoose
 *
 * Nota para entornos serverless (Vercel): cada invocación puede crear una
 * instancia nueva del módulo, así que se cachea la conexión en `globalThis`
 * para reutilizarla entre invocaciones y cold starts. Sin esto, Atlas agota
 * el pool de conexiones y la API empieza a fallar por timeouts.
 */
import mongoose from 'mongoose';
import { MONGODB_URI } from './env.js';

// Evita que Mongoose reintente eternamente cuando la base no responde.
mongoose.set('bufferCommands', false);

/**
 * Conecta a MongoDB usando la URI de configuración.
 * Si la conexión ya está abierta o en curso, la reutiliza.
 * @param {boolean} options.allowRetry - En serverless no se debe matar el proceso
 * @returns {Promise<import('mongoose').Connection|null>}
 */
export const connectDB = async ({ allowRetry = false } = {}) => {
  // 1 = conectada, 2 = conectando
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (mongoose.connection.readyState === 2) return mongoose.connection;

  if (!globalThis.__byJersMongoPromise) {
    globalThis.__byJersMongoPromise = mongoose
      .connect(MONGODB_URI, {
        // Atlas necesita reutilizar conexiones en Lambdas en frío.
        maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE) || 5,
        serverSelectionTimeoutMS: 10000,
      })
      .then((conn) => {
        console.log(`MongoDB conectado: ${conn.connection.host}`);
        return conn.connection;
      })
      .catch((error) => {
        // Permite reintentar en la siguiente invocación en vez de cachear el fallo.
        globalThis.__byJersMongoPromise = null;
        throw error;
      });
  }

  try {
    return await globalThis.__byJersMongoPromise;
  } catch (error) {
    console.error('Error conectando a MongoDB', { name: error.name, message: error.message });
    if (!allowRetry) process.exit(1);
    return null;
  }
};

export default connectDB;
