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
 */
const redact = value => String(value ?? '')
  .replace(/([?&](?:token|code|email|password|secret|access_token|refresh_token)=)[^&\s]*/gi, '$1[REDACTED]')
  .replace(/(authorization|cookie|set-cookie|jwt|password|secret)(\s*[:=]\s*)[^\s,;]+/gi, '$1$2[REDACTED]');

const requestPath = req => String(req.originalUrl || '').split('?')[0];

/** Convierte los errores de validacion de Mongoose al formato details[]. */
const mongooseDetails = err =>
  Object.values(err.errors).map(e => ({ field: e.path, message: e.message }));

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
      message: redact(err.message),
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

  return sendError(res, status, code, message, { details: err.details });
};

/**
 * envuelve controladores async para que un rechazo llegue al errorHandler.
 * Los controladores no necesitan try/catch alrededor de cada operacion.
 */
export const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
