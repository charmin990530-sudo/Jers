/**
 * errorHandler.js - Manejo Centralizado de Errores
 * 
 * ARQUITECTURA:
 * 1. AppError: Clase base para errores operacionales (esperados)
 * 2. notFound: Middleware 404 para rutas no definidas
 * 3. errorHandler: Middleware global (ÚLTIMO en app.use)
 * 4. asyncHandler: Wrapper para controllers async (evita try/catch)
 * 
 * CÓDIGOS DE ERROR ESTÁNDAR:
 * - VALIDATION_ERROR: 400 (Zod/Mongoose validation)
 * - INVALID_ID: 400 (ObjectId malformado)
 * - DUPLICATE_FIELD: 400 (unique constraint)
 * - UNAUTHENTICATED: 401 (sin token)
 * - INVALID_TOKEN: 401 (token malformed)
 * - TOKEN_EXPIRED: 401 (token expired)
 * - FORBIDDEN: 403 (sin permisos)
 * - NOT_FOUND: 404 (recurso no existe)
 * - INTERNAL_ERROR: 500 (inesperado)
 * - RATE_LIMIT_EXCEEDED: 429 (rate limit)
 */

// Clase base para errores controlados (operacionales)
// isOperational = true -> error esperado, mensaje seguro para cliente
export class AppError extends Error {
  constructor(message, statusCode, code = 'ERROR') {
    super(message);
    this.statusCode = statusCode;    // HTTP status
    this.code = code;                // Código interno para frontend
    this.isOperational = true;       // Diferencia de bugs reales
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Middleware 404: Se ejecuta si ninguna ruta coincide
 * Debe ir DESPUÉS de todas las rutas definidas
 */
export const notFound = (req, res, next) => {
  const error = new AppError('Recurso no encontrado', 404, 'NOT_FOUND');
  error.requestId = req.requestId;
  next(error);
};

/**
 * Middleware Global de Errores: ÚLTIMO en la cadena
 * Captura TODOS los errores no manejados y formatea respuesta consistente
 * 
 * ORDEN DE EJECUCIÓN:
 * 1. Log en desarrollo
 * 2. Maneja errores conocidos (Validation, Cast, Duplicate, JWT)
 * 3. Respuesta genérica para errores desconocidos
 * 4. Nunca expone stack traces en la respuesta
 */
const redact = value => String(value ?? '')
  .replace(/([?&](?:token|code|email|password|secret|access_token|refresh_token)=)[^&\s]*/gi, '$1[REDACTED]')
  .replace(/(authorization|cookie|set-cookie|jwt|password|secret)(\s*[:=]\s*)[^\s,;]+/gi, '$1$2[REDACTED]');

const requestPath = req => String(req.originalUrl || '').split('?')[0];

export const errorHandler = (err, req, res, next) => {
  // Defaults si no vienen de AppError
  err.statusCode = err.statusCode || 500;
  err.code = err.code || 'INTERNAL_ERROR';

  // Log detallado solo en desarrollo
  if (process.env.NODE_ENV === 'development') {
    console.error('Error:', {
      requestId: req.requestId,
      message: redact(err.message),
      errorName: err.name,
      code: err.code,
      statusCode: err.statusCode,
      path: requestPath(req),
      method: req.method,
    });
  }

  // ---------- ERRORES CONOCIDOS CON RESPUESTA ESPECÍFICA ----------

  // Mongoose ValidationError: campos requeridos, min/max, enum, etc.
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({
      success: false,
      message: 'Error de validación',
      errors: messages,
      code: 'VALIDATION_ERROR',
    });
  }

  // CastError: ObjectId inválido (ej: "abc" en lugar de ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: 'Identificador inválido',
      code: 'INVALID_ID',
    });
  }

  // Duplicate key (MongoError 11000): unique constraint violated
  if (err.code === 11000) {
    return res.status(400).json({
      success: false,
      message: 'El recurso ya existe',
      code: 'DUPLICATE_FIELD',
    });
  }

  // JWT Errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Token inválido',
      code: 'INVALID_TOKEN',
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Token expirado',
      code: 'TOKEN_EXPIRED',
    });
  }

  // ---------- RESPUESTA GENÉRICA ----------
  const response = {
    success: false,
    message: err.isOperational ? redact(err.message) : 'Error interno del servidor',
    code: err.code,
    requestId: req.requestId,
  };

  res.status(err.statusCode).json(response);
};

/**
 * asyncHandler - Wrapper para controllers async
 * EVITA try/catch repetitivo en cada controller
 * 
 * USO:
 * export const getProducts = asyncHandler(async (req, res) => {
 *   const products = await Product.find();
 *   res.json({ success: true, products });
 * });
 * 
 * Si la promise rechaza, pasa al errorHandler automáticamente
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};