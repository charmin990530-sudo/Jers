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
      return res.status(401).json({
        success: false,
        message: 'No autenticado. Inicia sesión para continuar.',
        code: 'UNAUTHENTICATED',
      });
    }

    // 2. Verificar firma y expiración
    const decoded = jwt.verify(token, JWT_SECRET, JWT_VERIFY_OPTIONS);
    const legacyTokenAllowed = NODE_ENV === 'test';
    if (decoded.ver === undefined && !legacyTokenAllowed) {
      return res.status(401).json({
        success: false,
        message: 'La sesión debe renovarse. Inicia sesión nuevamente.',
        code: 'TOKEN_REVOKED',
      });
    }

    // 3. Buscar usuario (sin password, no se necesita en middleware)
    const user = await User.findById(decoded.id);
    
    // 4. Validar existencia y estado activo
    if (!user || !user.activo) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no encontrado o inactivo.',
        code: 'USER_NOT_FOUND',
      });
    }

    if (decoded.ver !== undefined && decoded.ver !== user.tokenVersion) {
      return res.status(401).json({
        success: false,
        message: 'La sesión fue revocada. Inicia sesión nuevamente.',
        code: 'TOKEN_REVOKED',
      });
    }

    // 5. Adjuntar a request para controllers
    req.user = user;           // Documento completo Mongoose
    req.userId = user._id;     // ObjectId para queries rápidas
    next();
  } catch (error) {
    // Manejo específico de errores JWT
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Sesión expirada o inválida. Inicia sesión nuevamente.',
        code: 'INVALID_TOKEN',
      });
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
      return res.status(401).json({
        success: false,
        message: 'No autenticado.',
        code: 'UNAUTHENTICATED',
      });
    }

    // Verificar rol
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para realizar esta acción.',
        code: 'FORBIDDEN',
      });
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