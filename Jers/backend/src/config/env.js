/**
 * env.js - Configuración centralizada de variables de entorno
 * Carga .env y exporta constantes tipadas con valores por defecto seguros
 * IMPORTANTE: En producción TODAS las variables deben estar en .env (sin defaults inseguros)
 */
import crypto from 'crypto';
import dotenv from 'dotenv';
import { statSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const envPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../.env');
dotenv.config({ path: envPath });

// Puerto del servidor (3000 por defecto)
export const HOST = process.env.HOST || '127.0.0.1';
export const PORT = Number.parseInt(process.env.PORT || '3000', 10);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error('PORT debe ser un número entero entre 1 y 65535');
}

// Entorno: 'development' | 'production' | 'test'
if (!process.env.NODE_ENV) {
  throw new Error('NODE_ENV debe estar definido explícitamente');
}
export const NODE_ENV = process.env.NODE_ENV;
export const SECRETS_FROM_ENV = process.env.SECRETS_FROM_ENV === 'true';
if (!['development', 'production', 'test'].includes(NODE_ENV)) {
  throw new Error('NODE_ENV debe ser development, production o test');
}

// URI de MongoDB (local por defecto)
export const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/by-jers';
if (NODE_ENV === 'production' && MONGODB_URI.includes('localhost')) {
  throw new Error('MONGODB_URI no puede apuntar a localhost en producción');
}

const jwtSecret = process.env.JWT_SECRET;
if (NODE_ENV === 'production' && (!jwtSecret || jwtSecret.length < 64 || /change|cambia|example|secret/i.test(jwtSecret))) {
  throw new Error('JWT_SECRET debe ser un valor aleatorio de al menos 64 caracteres en producción');
}
const ephemeralDevelopmentSecret = crypto.randomBytes(64).toString('hex');
export const JWT_ALGORITHM = 'HS256';
export const JWT_SECRET = jwtSecret || ephemeralDevelopmentSecret;

export const JWT_ISSUER = process.env.JWT_ISSUER || 'by-jers-api';
export const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'by-jers-store';
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
export const SESSION_EXPIRES_IN = process.env.SESSION_EXPIRES_IN || '1d';
export const REMEMBER_ME_EXPIRES_IN = process.env.REMEMBER_ME_EXPIRES_IN || '30d';

const durationToMs = (value) => {
  const match = /^(\d+)\s*(s|m|h|d|w)$/i.exec(String(value).trim());
  if (!match) throw new Error(`Duración inválida: ${value}`);
  const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };
  return Number(match[1]) * multipliers[match[2].toLowerCase()];
};
export const getDurationMs = durationToMs;

export const JWT_COOKIE_NAME = process.env.JWT_COOKIE_NAME || 'token';

const parseOrigins = (value) => value.split(',').map(origin => origin.trim()).filter(Boolean);
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
let frontendUrlObject;
try {
  frontendUrlObject = new URL(frontendUrl);
  if (!['http:', 'https:'].includes(frontendUrlObject.protocol) || frontendUrlObject.username || frontendUrlObject.password) {
    throw new Error('unsupported');
  }
} catch {
  throw new Error('FRONTEND_URL debe ser una URL HTTP(S) sin credenciales');
}
let frontendOrigins = parseOrigins(process.env.FRONTEND_ALLOWED_ORIGINS || frontendUrl);
if (NODE_ENV !== 'production') {
  frontendOrigins = [...frontendOrigins, 'http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:5500', 'http://127.0.0.1:5500'];
}
export const FRONTEND_URL = frontendUrlObject.toString().replace(/\/$/, '');
export const FRONTEND_ALLOWED_ORIGINS = [...new Set(frontendOrigins.map(origin => {
  try {
    return new URL(origin).origin;
  } catch {
    throw new Error(`Origen de frontend inválido: ${origin}`);
  }
}))];
if (NODE_ENV === 'production' && FRONTEND_ALLOWED_ORIGINS.some(origin => !origin.startsWith('https://'))) {
  throw new Error('FRONTEND_ALLOWED_ORIGINS debe usar HTTPS en producción');
}
if (NODE_ENV === 'production' && !FRONTEND_ALLOWED_ORIGINS.includes(frontendUrlObject.origin)) {
  throw new Error('FRONTEND_URL debe estar incluido en FRONTEND_ALLOWED_ORIGINS');
}
const configuredApiOrigin = process.env.API_ORIGIN || `http://localhost:${PORT}`;
let apiOriginObject;
try {
  apiOriginObject = new URL(configuredApiOrigin);
  if (!['http:', 'https:'].includes(apiOriginObject.protocol) || apiOriginObject.username || apiOriginObject.password) {
    throw new Error('unsupported');
  }
} catch {
  throw new Error('API_ORIGIN debe ser una URL HTTP(S) sin credenciales');
}
export const API_ORIGIN = apiOriginObject.origin;
if (NODE_ENV === 'production' && !API_ORIGIN.startsWith('https://')) {
  throw new Error('API_ORIGIN debe usar HTTPS en producción');
}

// Rate limiting: ventana de tiempo en ms (15 min = 900000ms)
export const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000;

// Rate limiting: máx peticiones por ventana
export const RATE_LIMIT_MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100;

// Auth rate limiting: más estricto (5 req/min para login/register)
export const AUTH_RATE_LIMIT_WINDOW_MS = parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS) || 60000; // 1 min
export const AUTH_RATE_LIMIT_MAX_REQUESTS = parseInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS) || 5;
export const CONTACT_RATE_LIMIT_WINDOW_MS = parseInt(process.env.CONTACT_RATE_LIMIT_WINDOW_MS) || 900000;
export const CONTACT_RATE_LIMIT_MAX_REQUESTS = parseInt(process.env.CONTACT_RATE_LIMIT_MAX_REQUESTS) || 5;

// Redis configuration for rate limiting (producción)
export const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
export const REDIS_ENABLED = process.env.REDIS_ENABLED === 'true' && NODE_ENV === 'production';
export const TRUST_PROXY_HOPS = Number.parseInt(process.env.TRUST_PROXY_HOPS || '0', 10);
if (!Number.isInteger(TRUST_PROXY_HOPS) || TRUST_PROXY_HOPS < 0 || TRUST_PROXY_HOPS > 5) {
  throw new Error('TRUST_PROXY_HOPS debe estar entre 0 y 5');
}

// Cookie secure: true solo en producción (HTTPS)
export const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true' || NODE_ENV === 'production';
if (NODE_ENV === 'production' && !COOKIE_SECURE) {
  throw new Error('COOKIE_SECURE debe ser true en producción');
}

export const COOKIE_SAME_SITE = process.env.COOKIE_SAME_SITE || 'lax';
if (!['lax', 'strict', 'none'].includes(COOKIE_SAME_SITE)) {
  throw new Error('COOKIE_SAME_SITE debe ser lax, strict o none');
}
if (COOKIE_SAME_SITE === 'none' && !COOKIE_SECURE) {
  throw new Error('COOKIE_SAME_SITE=none requiere COOKIE_SECURE=true');
}

// WhatsApp number for order notifications (formato: 573114333561)
const whatsappNumber = (process.env.WHATSAPP_NUMBER || '573114333561').replace(/\D/g, '');
if (!/^\d{10,15}$/.test(whatsappNumber)) {
  throw new Error('WHATSAPP_NUMBER debe contener entre 10 y 15 dígitos');
}
export const WHATSAPP_NUMBER = whatsappNumber;

// CSP Configuration
export const CSP_NONCE_ENABLED = process.env.CSP_NONCE_ENABLED === 'true';
export const CSP_REPORT_ONLY = process.env.CSP_REPORT_ONLY === 'true' && NODE_ENV === 'production';
export const CSP_REPORT_URI = process.env.CSP_REPORT_URI || '';

export const SMTP_HOST = process.env.SMTP_HOST || '';
export const SMTP_PORT = Number.parseInt(process.env.SMTP_PORT || '587', 10);
export const SMTP_SECURE = process.env.SMTP_SECURE === 'true' || SMTP_PORT === 465;
export const SMTP_USER = process.env.SMTP_USER || '';
export const SMTP_PASS = process.env.SMTP_PASS || '';
export const EMAIL_FROM = process.env.EMAIL_FROM || 'By Jers <noreply@byjers.com>';
if (NODE_ENV === 'production' && (!SMTP_HOST || !SMTP_USER || !SMTP_PASS)) {
  throw new Error('SMTP_HOST, SMTP_USER y SMTP_PASS son obligatorios en producción');
}

export const validateSecurityEnvironment = () => {
  const errors = [];
  const configuredSecret = process.env.JWT_SECRET || '';
  const minimumSecretLength = NODE_ENV === 'production' ? 64 : 32;
  if (NODE_ENV !== 'test' && (!configuredSecret || configuredSecret.length < minimumSecretLength || /change|cambia|example|secret/i.test(configuredSecret))) {
    errors.push('JWT_SECRET');
  }
  if (!/^[A-Za-z0-9._:-]{3,64}$/.test(HOST)) errors.push('HOST');
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(JWT_COOKIE_NAME)) errors.push('JWT_COOKIE_NAME');
  if (NODE_ENV === 'production' && (!process.env.JWT_ISSUER || !process.env.JWT_AUDIENCE)) errors.push('JWT_ISSUER/JWT_AUDIENCE');
  try {
    if (getDurationMs(JWT_EXPIRES_IN) > 90 * 24 * 60 * 60 * 1000) errors.push('JWT_EXPIRES_IN');
    if (getDurationMs(SESSION_EXPIRES_IN) > 7 * 24 * 60 * 60 * 1000) errors.push('SESSION_EXPIRES_IN');
    if (getDurationMs(REMEMBER_ME_EXPIRES_IN) > 30 * 24 * 60 * 60 * 1000) errors.push('REMEMBER_ME_EXPIRES_IN');
  } catch {
    errors.push('JWT_DURATION');
  }
  if (!Number.isInteger(SMTP_PORT) || SMTP_PORT < 1 || SMTP_PORT > 65535) errors.push('SMTP_PORT');
  if (/[\r\n]/.test(EMAIL_FROM)) errors.push('EMAIL_FROM');
  if (NODE_ENV === 'production') {
    if (process.env.JEST_WORKER_ID) errors.push('JEST_WORKER_ID');
    if (!REDIS_ENABLED) errors.push('REDIS_ENABLED');
    try {
      const envStats = statSync(envPath);
      if (!envStats.isFile() || (envStats.mode & 0o077) !== 0) errors.push('.env permissions');
    } catch (error) {
      if (error.code !== 'ENOENT' || !SECRETS_FROM_ENV) errors.push('.env permissions');
    }
    if (!REDIS_URL.startsWith('rediss://')) errors.push('REDIS_TLS');
    if (!MONGODB_URI.startsWith('mongodb+srv://') && !/[?&]tls=true(?:&|$)/.test(MONGODB_URI)) errors.push('MONGODB_URI_TLS');
    if (!COOKIE_SECURE) errors.push('COOKIE_SECURE');
    if (CSP_REPORT_ONLY) errors.push('CSP_REPORT_ONLY');
    if (FRONTEND_ALLOWED_ORIGINS.some(origin => !origin.startsWith('https://'))) errors.push('FRONTEND_ALLOWED_ORIGINS');
    if (CSP_REPORT_URI && !CSP_REPORT_URI.startsWith('/api/')) errors.push('CSP_REPORT_URI');
  }
  if (errors.length) throw new Error(`Configuración de seguridad inválida: ${errors.join(', ')}`);
  return true;
};