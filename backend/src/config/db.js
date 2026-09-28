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
        // Configurable porque 10 s es mucho rato para una tienda: con la base
        // caida, cada peticion a la API se quedaba 10 s colgada antes de
        // responder 503. En local 2 s es de sobra para distinguir "Mongo no
        // arranca" de "Mongo tardo en arrancar".
        serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS) || 2000,
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
    // ANTES aqui se hacia `process.exit(1)` cuando no venia `allowRetry`. Eso
    // hacia imposible que el llamador decidiera: con la base caida el proceso
    // moria antes de que el servidor HTTP llegara a escuchar, y el navegador se
    // quedaba sin pagina ni mensaje, solo un "connection refused".
    //
    // Ahora la decision es de quien llama:
    //   - startServer() arranca igual y deja que cada ruta devuelva 503, o
    //     sale si pidio fail-fast con FAIL_FAST_ON_DB_ERROR=true.
    //   - el middleware por peticion devuelve 503 DATABASE_UNAVAILABLE y
    //     `allowRetry` sigue significando "no abortes el proceso".
    if (allowRetry) return null;
    throw error;
  }
};

export default connectDB;
