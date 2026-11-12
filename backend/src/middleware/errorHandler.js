/**
 * errorHandler.js - Manejo centralizado de errores
 *
 * ARQUITECTURA
 * 1. AppError: clase de error operativo (esperado, con status y codigo).
 * 2. notFound: 404 para rutas no definidas.
 * 3. errorHandler: middleware global, ULTIMO de la cadena.
 * 4. asyncHandler: envuelve controladores async.
 *
 * El cuerpo de la respuesta lo construye SIEMPRE `sendError` (ver apiError.js),
 * de modo que ningun camino puede inventarse su propia forma:
 *
 *   { "error": { "code": "...", "message": "...", "details": [...] }, "requestId": "..." }
 *
 * REGLA DE SEGURIDAD
 * ------------------
 * Un error NO marcado como `isOperational` es un bug o un fallo de dependencia.
 * Su mensaje nunca viaja al cliente: se registra en el log del servidor y se
 * responde con un texto generico. Solo los AppError (validacion, no encontrado,
 * conflicto) exponen su mensaje.
 */

import { NODE_ENV } from '../config/env.js';
import { AppError, ErrorCodes, sendError } from './apiError.js';

export { AppError };

/** Middleware 404: se ejecuta si ninguna ruta coincide. Va DESPUES de las rutas. */
export const notFound = (req, res, next) => {
  next(new AppError('Recurso no encontrado', 404, ErrorCodes.NOT_FOUND));
};

/**
 * Oculta secretos que puedan aparecer dentro de un mensaje de error antes de
 * escribirlo en el log o devolverlo. Cubre tokens en query strings y pares
 * clave:valor tipo Authorization/Cookie/JWT.
 *
 * El tercer patrón es para credenciales dentro de una URL
 * (`rediss://user:clave@host`). B-32 lo daba por posible, sin confirmar, y se
 * comprobó que los drivers de Mongo y Redis NO ponen la URL ni la clave en sus
 * mensajes de error: se probaron cuatro caminos reales —conexión rechazada,
 * autenticación fallida, protocolo inválido y host inalcanzable— y en ninguno sale
 * la contraseña. Aun así se cubre el patrón, porque `redact` se aplica a TODO
 * mensaje de error, incluidos los de terceros, y una sola línea evita que el día
 * que un driver o una dependencia sí lo incluya, no haya nada que arreglar ese día.
 */
const redact = value => String(value ?? '')
  .replace(/([?&](?:token|code|email|password|secret|access_token|refresh_token)=)[^&\s]*/gi, '$1[REDACTED]')
  // Cabeceras cuyo valor entero es secreto: se corta al fin de línea, no al primer
  // espacio. Antes el patrón era `[^\s,;]+`, o sea que de
  // `Authorization: Bearer eyJhbGci...` solo salía "Bearer" y el JWT entero se
  // quedaba en el log. Con Cookie pasaba igual: de `Cookie: session=abc; otra=def`
  // solo se tapaba el primer valor.
  .replace(/(authorization|proxy-authorization|cookie|set-cookie)(\s*[:=]\s*)[^\n]+/gi, '$1$2[REDACTED]')
  // El resto son valores de una sola palabra: basta con cortar en espacio o coma.
  .replace(/(jwt|password|secret|api[-_]?key)(\s*[:=]\s*)[^\s,;]+/gi, '$1$2[REDACTED]')
  // El usuario puede ir vacío, que es la forma habitual de las URLs de Redis.
  .replace(/([a-z][a-z0-9+.-]*:\/\/)([^/\s:@]*):([^/\s@]+)@/gi, '$1$2:[REDACTED]@')
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED]')
  .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED]');

const requestPath = req => String(req.originalUrl || '').split('?')[0];

/** Convierte los errores de validacion de Mongoose al formato details[]. */
const mongooseDetails = err =>
  Object.values(err.errors).map(e => ({ field: e.path, message: 'Valor no válido para este campo' }));

export const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  const status = Number.isInteger(err.statusCode) ? err.statusCode : 500;
  const code = typeof err.code === 'string' ? err.code : ErrorCodes.INTERNAL_ERROR;

  // Un JSON malformado lo produce express.json() con status 400 pero sin `code`
  // de negocio. Sin este caso el cliente recibia 400 + INTERNAL_ERROR + "Error
  // interno del servidor", una combinacion que no significa nada.
  if (err.type === 'entity.parse.failed' || (status === 400 && err instanceof SyntaxError)) {
    return sendError(res, 400, ErrorCodes.VALIDATION_ERROR, 'El cuerpo de la peticion no es JSON valido');
  }
  if (err.type === 'entity.too.large') {
    return sendError(res, 413, ErrorCodes.PAYLOAD_TOO_LARGE, 'El cuerpo de la peticion es demasiado grande');
  }

  const operational = err.isOperational === true;
  const message = operational ? redact(err.message) : 'Error interno del servidor';

  if (!operational || status >= 500) {
    console.error('Error no controlado', {
      requestId: req.requestId,
      message: err.code === 11000 || ['ValidationError', 'CastError'].includes(err.name)
        ? 'Validación de datos rechazada' : redact(err.message),
      errorName: err.name,
      code,
      statusCode: status,
      path: requestPath(req),
      method: req.method,
    });
  } else if (NODE_ENV === 'development') {
    console.error('Error controlado', {
      requestId: req.requestId,
      code,
      message,
      path: requestPath(req),
      method: req.method,
    });
  }

  // Validacion de Mongoose: el unico error de dependencia cuyo detalle SI es
  // seguro y util para el cliente, porque describe campos del documento.
  if (err.name === 'ValidationError') {
    return sendError(res, 400, ErrorCodes.VALIDATION_ERROR, 'Error de validacion', {
      details: mongooseDetails(err),
    });
  }
  if (err.name === 'CastError') {
    return sendError(res, 400, ErrorCodes.INVALID_ID, 'Identificador invalido');
  }
  if (err.code === 11000) {
    return sendError(res, 400, ErrorCodes.DUPLICATE_FIELD, 'El recurso ya existe');
  }
  if (err.name === 'JsonWebTokenError') {
    return sendError(res, 401, ErrorCodes.INVALID_TOKEN, 'Token invalido');
  }
  if (err.name === 'TokenExpiredError') {
    return sendError(res, 401, ErrorCodes.TOKEN_EXPIRED, 'Token expirado');
  }

  return sendError(res, status, code, message, { details: operational ? err.details : undefined });
};

/**
 * envuelve controladores async para que un rechazo llegue al errorHandler.
 * Los controladores no necesitan try/catch alrededor de cada operacion.
 */
export const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
