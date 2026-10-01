import crypto from 'crypto';
import {
  JWT_SECRET,
  NODE_ENV,
  FRONTEND_ALLOWED_ORIGINS,
  COOKIE_SECURE,
  COOKIE_SAME_SITE,
} from '../config/env.js';
import { ErrorCodes, sendError } from './apiError.js';

const CSRF_COOKIE_NAME = 'jers_csrf';
const CSRF_HEADER_NAME = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'POST', 'PATCH', 'PUT', 'DELETE']);
const csrfKey = crypto.createHash('sha256').update(`${JWT_SECRET}:csrf:v1`).digest();

const randomToken = () => crypto.randomBytes(32).toString('base64url');
const signToken = raw => `${raw}.${crypto.createHmac('sha256', csrfKey).update(raw).digest('base64url')}`;
const constantTimeEqual = (left, right) => {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const isValidCsrfToken = token => {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) return false;
  const [raw, signature] = parts;
  if (!raw || !signature || raw.length < 32) return false;
  const expected = crypto.createHmac('sha256', csrfKey).update(raw).digest('base64url');
  return constantTimeEqual(signature, expected);
};

const setCsrfCookie = (res, token) => {
  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: false,
    secure: COOKIE_SECURE,
    sameSite: COOKIE_SAME_SITE,
    path: '/',
    maxAge: 8 * 60 * 60 * 1000,
  });
};

const ensureCsrfToken = (req, res) => {
  const existing = req.cookies?.[CSRF_COOKIE_NAME];
  if (isValidCsrfToken(existing)) {
    req.csrfToken = existing;
    return existing;
  }
  const token = signToken(randomToken());
  req.csrfToken = token;
  setCsrfCookie(res, token);
  return token;
};

const reject = (res, status, code, message, options) => sendError(res, status, code, message, options);

const requestSecurity = (req, res, next) => {
  const suppliedId = req.get('x-request-id');
  const requestId = suppliedId && /^[A-Za-z0-9._-]{1,64}$/.test(suppliedId)
    ? suppliedId
    : crypto.randomUUID();
  req.requestId = requestId;
  res.locals.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  if (!ALLOWED_METHODS.has(req.method)) return reject(res, 405, ErrorCodes.METHOD_NOT_ALLOWED, 'Método no permitido');
  const rawPath = String(req.originalUrl || '').split('?')[0];
  if (rawPath.includes('//') || /%2f/i.test(rawPath)) {
    return reject(res, 400, ErrorCodes.INVALID_PATH, 'Ruta no válida');
  }
  // Se comprueba la cabecera declarada y no `req.is()`, que devuelve falso
  // cuando la peticion no trae cuerpo: un POST sin cuerpo pero que declara
  // application/json es una peticion legitima (cerrar sesion, por ejemplo) y
  // antes se rechazaba con 415. El riesgo de CSRF sigue cubierto porque un
  // formulario HTML solo puede enviar text/plain, multipart o urlencoded, nunca
  // application/json.
  const declaraJson = String(req.get('content-type') || '').toLowerCase().includes('application/json');
  if (['POST', 'PATCH', 'PUT'].includes(req.method) && req.path !== '/api/csp-report' && !declaraJson) {
    return reject(res, 415, ErrorCodes.UNSUPPORTED_MEDIA_TYPE, 'Content-Type debe ser application/json');
  }
  next();
};

/**
 * ¿El origen de la petición es esta misma servidor?
 *
 * Hace falta porque este backend también sirve el sitio, así que la página y la
 * API comparten host. Una lista de orígenes admitidos no puede cubrir todos los
 * nombres con los que se puede entrar al mismo servidor (localhost, 127.0.0.1, la
 * IP de la red, un dominio propio...) y quedarse sin ninguno provocaba un 403
 * "Origen no permitido" en todas las peticiones que mutan. Comparar con el host
 * real de la petición cubre todos esos casos a la vez sin abrir la puerta: si el
 * host no coincide, el origen es de otro sitio y se sigue rechazando.
 */
const esMismoServidor = (origin, req) => {
  try {
    const host = req.get('host');
    if (!host) return false;
    return new URL(origin).host === host;
  } catch {
    return false;
  }
};

const originGuard = (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  if (req.get('sec-fetch-site') === 'cross-site') {
    return reject(res, 403, ErrorCodes.ORIGIN_NOT_ALLOWED, 'Origen no permitido');
  }
  const origin = req.get('origin');
  const referer = req.get('referer');
  const refererOrigin = referer ? (() => {
    try { return new URL(referer).origin; } catch { return null; }
  })() : null;
  if (origin) {
    return FRONTEND_ALLOWED_ORIGINS.includes(origin) || esMismoServidor(origin, req)
      ? next()
      : reject(res, 403, ErrorCodes.ORIGIN_NOT_ALLOWED, 'Origen no permitido');
  }
  if (refererOrigin && (FRONTEND_ALLOWED_ORIGINS.includes(refererOrigin) || esMismoServidor(refererOrigin, req))) {
    return next();
  }
  if (NODE_ENV !== 'production') return next();
  return reject(res, 403, ErrorCodes.ORIGIN_REQUIRED, 'Origen de solicitud requerido');
};

export const csrfProtection = (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) {
    ensureCsrfToken(req, res);
    return next();
  }
  if (req.path === '/api/csp-report') return next();
  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  const headerToken = req.get(CSRF_HEADER_NAME);
  if (!cookieToken || !headerToken || !constantTimeEqual(cookieToken, headerToken) || !isValidCsrfToken(cookieToken)) {
    return reject(res, 403, ErrorCodes.CSRF_TOKEN_INVALID, 'Token de seguridad inválido');
  }
  req.csrfToken = cookieToken;
  next();
};

export const securityMiddleware = [requestSecurity, originGuard];
