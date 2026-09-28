/**
 * apiError.js - Sobre de error unico de la API
 *
 * TODA respuesta de error de TODOS los endpoints tiene exactamente esta forma:
 *
 *   {
 *     "error": {
 *       "code": "VALIDATION_ERROR",
 *       "message": "Datos de entrada invalidos",
 *       "details": [ { "field": "email", "message": "Email invalido" } ]
 *     },
 *     "requestId": "0f3c…"
 *   }
 *
 * POR QUE UN SOLO PRODUCTOR
 * -------------------------
 * Antes cada capa daba su propia forma: unos-controladores usaban
 * { success:false, message, code }, el middleware de seguridad otro, y el
 * limitador de peticiones otro. Eso obligaba al frontend a leer el mensaje en
 * tres sitios distintos y hacia que un error raro (por ejemplo el 503 de
 * configuracion incompleta) llegara al cliente sin ningun campo consultable.
 *
 * Ahora `sendError` es el unico sitio que escribe un error, de modo que el
 * contrato se puede auditar leyendo un archivo. Los codigos son cadenas
 * estables: el frontend decide que hacer mirando `error.code`, nunca el texto
 * del mensaje.
 *
 * `details` es opcional y solo se usa cuando hay algo que destacar campo a campo
 * (validacion Zod o Mongoose).
 */

/** Error de dominio con estado HTTP y codigo de negocio. */
export class AppError extends Error {
  constructor(message, statusCode, code = 'ERROR', details = undefined) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, AppError);
  }
}

/** Codigos de negocio que la API puede devolver. */
export const ErrorCodes = Object.freeze({
  // 400
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_ID: 'INVALID_ID',
  DUPLICATE_FIELD: 'DUPLICATE_FIELD',
  INVALID_PATH: 'INVALID_PATH',
  INVALID_ROLE: 'INVALID_ROLE',
  INVALID_IDEMPOTENCY_KEY: 'INVALID_IDEMPOTENCY_KEY',
  PASSWORDS_MISMATCH: 'INVALID_RESET_TOKEN',
  // 401 / 403
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_REVOKED: 'TOKEN_REVOKED',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',
  ORIGIN_NOT_ALLOWED: 'ORIGIN_NOT_ALLOWED',
  ORIGIN_REQUIRED: 'ORIGIN_REQUIRED',
  CSRF_TOKEN_INVALID: 'CSRF_TOKEN_INVALID',
  // 404
  NOT_FOUND: 'NOT_FOUND',
  PRODUCT_NOT_FOUND: 'PRODUCT_NOT_FOUND',
  CATEGORY_NOT_FOUND: 'CATEGORY_NOT_FOUND',
  BRAND_NOT_FOUND: 'BRAND_NOT_FOUND',
  ORDER_NOT_FOUND: 'ORDER_NOT_FOUND',
  USER_NOT_FOUND_404: 'USER_NOT_FOUND',
  CART_NOT_FOUND: 'CART_NOT_FOUND',
  ITEM_NOT_FOUND: 'ITEM_NOT_FOUND',
  ADDRESS_NOT_FOUND: 'ADDRESS_NOT_FOUND',
  CONTACT_NOT_FOUND: 'CONTACT_NOT_FOUND',
  // 405 / 415
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  // 409
  CHECKOUT_IN_PROGRESS: 'CHECKOUT_IN_PROGRESS',
  CHECKOUT_STATE_CHANGED: 'CHECKOUT_STATE_CHANGED',
  PAID_ORDER_REQUIRES_REFUND: 'PAID_ORDER_REQUIRES_REFUND',
  ORDER_STATE_CHANGED: 'ORDER_STATE_CHANGED',
  INVALID_ORDER_TRANSITION: 'INVALID_ORDER_TRANSITION',
  // 413 / 415 / 429
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  AUTH_RATE_LIMIT_EXCEEDED: 'AUTH_RATE_LIMIT_EXCEEDED',
  CONTACT_RATE_LIMIT_EXCEEDED: 'CONTACT_RATE_LIMIT_EXCEEDED',
  // 5xx
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  TRANSACTIONS_UNAVAILABLE: 'TRANSACTIONS_UNAVAILABLE',
  CONFIG_INCOMPLETA: 'CONFIG_INCOMPLETA',
  DATABASE_UNAVAILABLE: 'DATABASE_UNAVAILABLE',
  // 503
  API_NOT_CONFIGURED: 'API_NOT_CONFIGURED',
});

/**
 * Construye el cuerpo de error sin enviarlo. Separado de `sendError` para que los
 * middlewares puedan anexar cabeceras (Retry-After) o registrarlo antes.
 * @param {string} code
 * @param {string} message
 * @param {Array<{field:string,message:string}>} [details]
 * @param {string} [requestId]
 * @returns {object}
 */
export const buildErrorBody = (code, message, details, requestId) => {
  const error = { code, message };
  if (Array.isArray(details) && details.length) error.details = details;
  return requestId ? { error, requestId } : { error };
};

/**
 * Envia una respuesta de error con la forma unica de la API.
 * @param {import('express').Response} res
 * @param {number} status
 * @param {string} code
 * @param {string} message
 * @param {object} [options]
 * @param {Array} [options.details] - Errores por campo.
 * @param {object} [options.headers] - Cabeceras extra (Retry-After, Allow...).
 * @returns {import('express').Response}
 */
export const sendError = (res, status, code, message, { details, headers } = {}) => {
  if (res.headersSent) return res;
  if (headers) res.set(headers);
  const requestId = res.locals?.requestId;
  return res.status(status).json(buildErrorBody(code, message, details, requestId));
};
