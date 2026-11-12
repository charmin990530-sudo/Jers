/** Transacciones con sesión explícita, snapshot y confirmación por mayoría.
 * Producción exige replica set o clúster fragmentado. Solo desarrollo admite
 * standalone con compensaciones; una detección fallida responde 503 y se reintenta.
 */
import mongoose from 'mongoose';
import { NODE_ENV } from '../config/env.js';
import { AppError, ErrorCodes } from '../middleware/apiError.js';

let supportPromise = null;
let warnedAboutNoSupport = false;

/**
 * Dice si el despliegue admite transacciones. Se comprueba una sola vez y se
 * cachea, porque implicaria una operacion de red en cada request.
 * @returns {Promise<boolean>}
 */
export const detectTransactionSupport = async () => {
  if (supportPromise) return supportPromise;
  supportPromise = (async () => {
    try {
      const admin = mongoose.connection.db.admin();
      const hello = await admin.command({ hello: 1 });
      // setName viene en los miembros de replica set y en mongos. Sin el, el
      // despliegue es standalone y el servidor rechazara la transaccion.
      return Boolean(hello.setName || hello.msg === 'isdbgrid');
    } catch (error) {
      console.warn('No se pudo detectar soporte de transacciones', { name: error.name });
      supportPromise = null;
      throw new AppError('No se pudo verificar la disponibilidad de transacciones. Intenta nuevamente.', 503, ErrorCodes.DATABASE_UNAVAILABLE);
    }
  })();
  return supportPromise;
};

/** Solo para tests: olvida el resultado cacheado. */
export const resetTransactionSupportCache = () => {
  supportPromise = null;
  warnedAboutNoSupport = false;
};

/**
 * Ejecuta `fn` dentro de una transaccion cuando el despliegue la admite.
 *
 * El callback recibe `{ session }`. DEBE reenviar esa sesion a cada consulta:
 *   await Order.create([datos], { session });
 *   await Product.bulkWrite([...], { session });
 *   await Cart.deleteOne(filtro, { session });
 *
 * @template T
 * @param {(ctx: {session: import("mongodb").ClientSession|null}) => Promise<T>} fn
 * @returns {Promise<{ transactional: boolean, result: T }>}
 *   `transactional` permite al llamador saber si hubo atomicidad real.
 */
export const withTransaction = async fn => {
  if (mongoose.connection.readyState !== 1) {
    throw new Error('withTransaction requiere una conexion a MongoDB abierta');
  }

  const supported = await detectTransactionSupport();
  if (!supported) {
    if (NODE_ENV === 'production') {
      throw new AppError('La base de producción debe admitir transacciones.', 503, ErrorCodes.TRANSACTIONS_UNAVAILABLE);
    }
    if (!warnedAboutNoSupport) {
      console.warn(
        '[db] MongoDB sin replica set: las transacciones NO estan disponibles. ' +
        'Se ejecutara la operacion sin atomicidad; la coherencia la garantiza la ' +
        'logica de compensacion de cada operacion. Para transacciones reales, ' +
        'arranca mongod con --replSet y ejecuta rs.initiate().',
      );
      warnedAboutNoSupport = true;
    }
    return { transactional: false, result: await fn({ session: null }) };
  }

  const session = await mongoose.startSession();
  try {
    let value;
    await session.withTransaction(async () => {
      value = await fn({ session });
    }, {
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
      readPreference: 'primary',
    });
    return { transactional: true, result: value };
  } finally {
    await session.endSession();
  }
};
