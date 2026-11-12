/**
 * db.js - Conexión a MongoDB usando Mongoose
 *
 * Nota para entornos serverless (Vercel): cada invocación puede crear una
 * instancia nueva del módulo, así que se cachea la conexión en `globalThis`
 * para reutilizarla entre invocaciones y cold starts. Sin esto, Atlas agota
 * el pool de conexiones y la API empieza a fallar por timeouts.
 */
import mongoose from 'mongoose';
import { MONGODB_URI, MONGO_MAX_POOL_SIZE, MONGO_SERVER_SELECTION_TIMEOUT_MS, NODE_ENV } from './env.js';

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

  if (!globalThis.__byJersMongoPromise) {
    // Compartir también la espera: readyState=2 todavía no permite consultar.
    // Una conexión iniciada desde otro módulo se espera con asPromise().
    const connectionAttempt = mongoose.connection.readyState === 2
      ? mongoose.connection.asPromise().then(connection => ({ connection }))
      : mongoose.connect(MONGODB_URI, {
        // Atlas necesita reutilizar conexiones en Lambdas en frío.
        maxPoolSize: MONGO_MAX_POOL_SIZE,
        serverSelectionTimeoutMS: MONGO_SERVER_SELECTION_TIMEOUT_MS,
      });
    globalThis.__byJersMongoPromise = connectionAttempt
      .then((conn) => {
        // Se enmascara el host: en producción es el nombre del cluster, que es
        // topología de infraestructura en los logs. Con el despliegue local se
        // sigue viendo el host real, que es lo que sirve para diagnosticar.
        const host = NODE_ENV === 'production' ? String(conn.connection.host).split('.')[0] + '.***' : conn.connection.host;
        console.log(`MongoDB conectado: ${host}`);
        return conn.connection;
      })
      .finally(() => {
        // Cachear solo el intento pendiente: un éxito antiguo no debe ocultar
        // una desconexión posterior e impedir una nueva conexión.
        globalThis.__byJersMongoPromise = null;
      });
  }

  try {
    return await globalThis.__byJersMongoPromise;
  } catch (error) {
    console.error('Error conectando a MongoDB', { name: error.name });
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
