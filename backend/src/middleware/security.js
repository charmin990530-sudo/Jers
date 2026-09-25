import crypto from 'crypto';
import {
  JWT_SECRET,
  NODE_ENV,
  FRONTEND_ALLOWED_ORIGINS,
  COOKIE_SECURE,
  COOKIE_SAME_SITE,
} from '../config/env.js';

export const CSRF_COOKIE_NAME = 'jers_csrf';
export const CSRF_HEADER_NAME = 'x-csrf-token';
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

export const isValidCsrfToken = token => {
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

const reject = (res, status, code, message) => res.status(status).json({
  success: false,
  message,
  code,
  requestId: res.locals.requestId,
});

export const requestSecurity = (req, res, next) => {
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
  if (!ALLOWED_METHODS.has(req.method)) return reject(res, 405, 'METHOD_NOT_ALLOWED', 'Método no permitido');
  const rawPath = String(req.originalUrl || '').split('?')[0];
  if (rawPath.includes('//') || /%2f/i.test(rawPath)) {
    return reject(res, 400, 'INVALID_PATH', 'Ruta no válida');
  }
  if (['POST', 'PATCH', 'PUT'].includes(req.method) && req.path !== '/api/csp-report' && !req.is('application/json')) {
    return reject(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type debe ser application/json');
  }
  next();
};

export const originGuard = (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  if (req.get('sec-fetch-site') === 'cross-site') {
    return reject(res, 403, 'ORIGIN_NOT_ALLOWED', 'Origen no permitido');
  }
  const origin = req.get('origin');
  const referer = req.get('referer');
  const refererOrigin = referer ? (() => {
    try { return new URL(referer).origin; } catch { return null; }
  })() : null;
  if (origin) {
    return FRONTEND_ALLOWED_ORIGINS.includes(origin)
      ? next()
      : reject(res, 403, 'ORIGIN_NOT_ALLOWED', 'Origen no permitido');
  }
  if (refererOrigin && FRONTEND_ALLOWED_ORIGINS.includes(refererOrigin)) return next();
  if (NODE_ENV !== 'production') return next();
  return reject(res, 403, 'ORIGIN_REQUIRED', 'Origen de solicitud requerido');
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
    return reject(res, 403, 'CSRF_TOKEN_INVALID', 'Token de seguridad inválido');
  }
  req.csrfToken = cookieToken;
  next();
};

export const issueCsrfToken = (req, res) => {
  const token = ensureCsrfToken(req, res);
  res.status(200).json({ success: true, csrfToken: token });
};

export const securityMiddleware = [requestSecurity, originGuard];
