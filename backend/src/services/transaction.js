/**
 * transaction.js - Transacciones reales de MongoDB con deteccion explicita
 *
 * POR QUE NO `mongoose.connection.transaction()`
 * ---------------------------------------------
 * Mongoose ofrece `connection.transaction()` y `session.withTransaction()`, pero
 * una de sus APIs NO propaga la sesion a las operaciones y por lo tanto no da
 * atomicidad. Comprobado en este proyecto:
 *
 *   - Sobre un replica set real, `connection.transaction()` devolvio "ok" y aun
 *     asi el documento escrito dentro del callback seguia presente tras
 *     abortar. El commit y el commit declaraban exito sobre una operacion que en
 *     realidad se habia ejecutado fuera de la transaccion.
 *   - Con el driver crudo pasando `{ session }` explicito, el mismo abort si
 *     revierte. La conclusion es que la sesion hay que pasarla a mano en cada
 *     operacion.
 *
 * Por eso este modulo expone la sesion y obliga a que cada consulta dentro del
 * callback la reciba. Si se olvida, la operacion sale de la transaccion y el
 * bug se manifests como "la transacion noSirve de nada", no como un error.
 *
 * SOPORTE EN MONGO SIN REPLICA SET
 * --------------------------------
 * Un mongod standalone rechaza las transacciones con
 * `Transaction numbers are only allowed on a replica set member or mongos`
 * (MongoServerError, code 20). Se detecta UNA vez al arrancar y:
 *
 *   - si el despliegue es replica set, se usa la transaccion real;
 *   - si no lo es, se ejecuta el callback sin sesion y se avisa por log. Quien
 *     llame a `withTransaction` recibe `{ transactional: false }` y debe saber
 *     que su logica de compensacion es la que esta garantizando la coherencia.
 *
 * Deliberadamente NO se degrada en silencio: un `catch` que convierte "no hay
 * transacciones" en un exito aparente es exactamente el fallo que se quiere
 * evitar aqui.
 */

import mongoose from 'mongoose';

/** Claves de error de Mongo/Servidor que significan "no hay soporte de transacciones". */
const NO_TRANSACTION_CODES = new Set([
  20,    // IllegalOperation: Transaction numbers are only allowed on a replica set member or mongos
  263,   // OperationNotSupportedInTransaction
  303,   // TransactionTooOldForHistory
  251,   // NoSuchTransaction
]);

/**
 * Codigos que un despliegue puede devolver cuando un cliente intenta usar
 * transacciones sin replica set. Se lookout de mas de uno porque cambian entre
 * versiones del servidor y de la topologia (sharded devuelve otros).
 */
const isMissingTransactionSupport = error => {
  if (!error) return false;
  if (NO_TRANSACTION_CODES.has(error.code)) return true;
  if (typeof error.codeName === 'string' && /NotSupported|NoSuchTransaction|IllegalOperation/.test(error.codeName)) {
    return /transaction/i.test(error.message || '') || error.code === 20;
  }
  return false;
};

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
      return Boolean(hello.setName);
    } catch (error) {
      console.warn('No se pudo detectar soporte de transacciones, se asume que no hay:', error.message);
      return false;
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

/**
 * Igual que `withTransaction` pero propaga el error de soporte ausente.
 * Se usa en operaciones donde perder la compensacion seria un fallo de
 * integridad silencioso y conviene que el cliente lo note en la respuesta.
 * @template T
 * @param {(ctx: {session: any}) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export const withRequiredTransaction = async fn => {
  const { transactional, result } = await withTransaction(fn);
  if (!transactional) {
    const error = new Error('Esta operacion requiere transacciones y el despliegue no las admite');
    error.code = 'TRANSACTIONS_UNAVAILABLE';
    error.statusCode = 503;
    throw error;
  }
  return result;
};
