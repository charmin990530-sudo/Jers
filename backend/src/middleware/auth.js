/**
 * auth.js - Middlewares de Autenticación y Autorización
 * 
 * FLUJO JWT:
 * 1. Login exitoso -> set cookie HttpOnly con JWT
 * 2. Cada request -> authenticate() lee cookie, verifica firma, busca user
 * 3. Si OK -> req.user = user, req.userId = user._id, next()
 * 4. Si falla -> 401 con código específico
 * 
 * COOKIE CONFIG (env.js):
 * - HttpOnly: true (no accesible desde JS, previene XSS)
 * - Secure: true solo en producción (HTTPS)
 * - SameSite: 'lax' (balance seguridad/UX)
 * - MaxAge: 7 días
 */

import jwt from 'jsonwebtoken';
import { User } from '../models/index.js';
import { JWT_SECRET, JWT_ALGORITHM, JWT_COOKIE_NAME, NODE_ENV, JWT_ISSUER, JWT_AUDIENCE } from '../config/env.js';
import { ErrorCodes, sendError } from './apiError.js';

const JWT_VERIFY_OPTIONS = {
  algorithms: [JWT_ALGORITHM],
  ...(NODE_ENV === 'production' ? { issuer: JWT_ISSUER, audience: JWT_AUDIENCE } : {}),
};

/**
 * authenticate - Middleware OBLIGATORIO de autenticación
 * Verifica JWT en cookie, adjunta user a request
 * 
 * USO: router.get('/perfil', authenticate, controller.getProfile)
 * 
 * RESPUESTAS DE ERROR:
 * - 401 UNAUTHENTICATED: Sin cookie token
 * - 401 INVALID_TOKEN: Token malformado/expirado
 * - 401 USER_NOT_FOUND: User borrado o inactivo
 * 
 * @param {Request} req - Request Express
 * @param {Response} res - Response Express
 * @param {Function} next - Next middleware
 */
export const authenticate = async (req, res, next) => {
  try {
    // 1. Leer token de cookie HttpOnly
    const token = req.cookies[JWT_COOKIE_NAME];

    if (!token) {
      return sendError(res, 401, ErrorCodes.UNAUTHENTICATED, 'No autenticado. Inicia sesión para continuar.');
    }

    // 2. Verificar firma y expiración
    const decoded = jwt.verify(token, JWT_SECRET, JWT_VERIFY_OPTIONS);
    const legacyTokenAllowed = NODE_ENV === 'test';
    if (decoded.ver === undefined && !legacyTokenAllowed) {
      return sendError(res, 401, ErrorCodes.TOKEN_REVOKED, 'La sesión debe renovarse. Inicia sesión nuevamente.');
    }

    // 3. Buscar usuario (sin password, no se necesita en middleware)
    const user = await User.findById(decoded.id);
    
    // 4. Validar existencia y estado activo
    if (!user || !user.activo) {
      return sendError(res, 401, ErrorCodes.USER_NOT_FOUND, 'Usuario no encontrado o inactivo.');
    }

    if (decoded.ver !== undefined && decoded.ver !== user.tokenVersion) {
      return sendError(res, 401, ErrorCodes.TOKEN_REVOKED, 'La sesión fue revocada. Inicia sesión nuevamente.');
    }

    // 5. Adjuntar a request para controllers
    req.user = user;           // Documento completo Mongoose
    req.userId = user._id;     // ObjectId para queries rápidas
    next();
  } catch (error) {
    // Manejo específico de errores JWT
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return sendError(res, 401, ErrorCodes.INVALID_TOKEN, 'Sesión expirada o inválida. Inicia sesión nuevamente.');
    }
    // Otros errores -> errorHandler global
    next(error);
  }
};

/**
 * authorize - Middleware de AUTORIZACIÓN por roles
 * Requiere que authenticate() se haya ejecutado ANTES
 * 
 * USO: router.delete('/users/:id', authenticate, authorize('admin'), controller.deleteUser)
 * 
 * @param {...String} roles - Roles permitidos ('user', 'admin')
 * @returns {Function} Middleware Express
 */
export const authorize = (...roles) => {
  return (req, res, next) => {
    // Doble check: authenticate debería haber puesto req.user
    if (!req.user) {
      return sendError(res, 401, ErrorCodes.UNAUTHENTICATED, 'No autenticado.');
    }

    // Verificar rol
    if (!roles.includes(req.user.role)) {
      return sendError(res, 403, ErrorCodes.FORBIDDEN, 'No tienes permisos para realizar esta acción.');
    }
    next();
  };
};

/**
 * optionalAuth - Autenticación OPACIONAL
 * Igual que authenticate pero NO falla si no hay token
 * Útil para: home page (mostrar productos + user si logueado)
 * 
 * USO: router.get('/', optionalAuth, controller.getProducts)
 * 
 * @param {Request} req
 * @param {Response} res
 * @param {Function} next
 */
export const optionalAuth = async (req, res, next) => {
  try {
    const token = req.cookies[JWT_COOKIE_NAME];
    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET, JWT_VERIFY_OPTIONS);
      const legacyTokenAllowed = NODE_ENV === 'test';
      if (decoded.ver === undefined && !legacyTokenAllowed) return;
      const user = await User.findById(decoded.id);
      if (user && user.activo && (decoded.ver === undefined || decoded.ver === user.tokenVersion)) {
        req.user = user;
        req.userId = user._id;
      }
    }
    next();  // Siempre next(), sin importar si hay user o no
  } catch {
    // Silenciosamente ignora errores de token
    next();
  }
};