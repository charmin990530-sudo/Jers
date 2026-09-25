/**
 * app.js - Punto de entrada principal del backend
 * Configura Express, middlewares globales, rutas y arranca el servidor
 */
import express from 'express';
import { randomBytes } from 'crypto';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createClient } from 'redis';
import { connectDB } from './config/db.js';
import { validateSecurityEnvironment } from './config/env.js';
import { 
  PORT,
  HOST,
  NODE_ENV,
  FRONTEND_URL,
  FRONTEND_ALLOWED_ORIGINS,
  API_ORIGIN,
  RATE_LIMIT_WINDOW_MS, 
  RATE_LIMIT_MAX_REQUESTS, 
  AUTH_RATE_LIMIT_WINDOW_MS, 
  AUTH_RATE_LIMIT_MAX_REQUESTS,
  CONTACT_RATE_LIMIT_WINDOW_MS,
  CONTACT_RATE_LIMIT_MAX_REQUESTS,
  REDIS_URL,
  REDIS_ENABLED,
  TRUST_PROXY_HOPS,
  CSP_NONCE_ENABLED,
  CSP_REPORT_ONLY,
  CSP_REPORT_URI
} from './config/env.js';
import { routes } from './routes/index.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import RedisRateLimitStore from './middleware/redisRateLimitStore.js';
import { securityMiddleware, csrfProtection } from './middleware/security.js';

const app = express();
app.disable('x-powered-by');
if (TRUST_PROXY_HOPS > 0) app.set('trust proxy', TRUST_PROXY_HOPS);
if (NODE_ENV === 'production') validateSecurityEnvironment();
let httpServer = null;

// ==========================================
// REDIS CLIENT (para rate limiting en producción)
// ==========================================
let redisClient = null;
let redisGeneralStore = null;
let redisAuthStore = null;
let redisContactStore = null;

if (REDIS_ENABLED) {
  redisClient = createClient({ url: REDIS_URL });
  redisClient.on('error', err => console.error('Redis Client Error', { name: err.name }));
  try {
    await redisClient.connect();
  } catch (error) {
    console.error('Redis no disponible', { name: error.name });
    throw new Error('Redis no disponible');
  }
  redisGeneralStore = new RedisRateLimitStore({ client: redisClient, prefix: 'rl:general:' });
  redisAuthStore = new RedisRateLimitStore({ client: redisClient, prefix: 'rl:auth:' });
  redisContactStore = new RedisRateLimitStore({ client: redisClient, prefix: 'rl:contact:' });
}

// ==========================================
// CSP NONCE MIDDLEWARE
// ==========================================
app.use((req, res, next) => {
  if (CSP_NONCE_ENABLED) {
    // Generar nonce aleatorio para cada request
    const nonce = randomBytes(16).toString('base64');
    res.locals.cspNonce = nonce;
    // Exponer para uso en templates si se usa template engine
    req.cspNonce = nonce;
  }
  next();
});

const cspDirectives = nonce => ({
  defaultSrc: ["'self'"],
  scriptSrc: nonce ? ["'self'", `'nonce-${nonce}'`] : ["'self'"],
  styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
  imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
  connectSrc: ["'self'", API_ORIGIN, ...FRONTEND_ALLOWED_ORIGINS],
  frameSrc: ["'none'"],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
  frameAncestors: ["'none'"],
  ...(NODE_ENV === 'production' ? { upgradeInsecureRequests: [] } : {}),
});

app.use((req, res, next) => {
  const nonce = req.cspNonce || (CSP_NONCE_ENABLED ? randomBytes(16).toString('base64') : null);
  const directives = cspDirectives(nonce);
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      directives,
      reportOnly: CSP_REPORT_ONLY,
      ...(CSP_REPORT_ONLY ? { reportUri: CSP_REPORT_URI || '/api/csp-report' } : {}),
    },
    referrerPolicy: { policy: 'no-referrer' },
    hsts: NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
  })(req, res, next);
});

const isAllowedOrigin = (origin) => !origin || FRONTEND_ALLOWED_ORIGINS.includes(origin);

app.use(cors({
  origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-Token', 'Idempotency-Key'],
}));

app.use(securityMiddleware);

// ==========================================
// RATE LIMITING: Configuración
// ==========================================
const createRateLimiter = (windowMs, max, message, code, store = undefined, skip = () => false) => {
  const config = {
    windowMs,
    limit: max,
    message: { success: false, message, code },
    standardHeaders: true,
    legacyHeaders: false,
    skip,
  };

  if (store) config.store = store;
  return rateLimit(config);
};

const limiter = createRateLimiter(
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_REQUESTS,
  'Demasiadas solicitudes. Intenta de nuevo más tarde.',
  'RATE_LIMIT_EXCEEDED',
  redisGeneralStore,
  req => req.path === '/api/health'
);

app.use(limiter);

const normalizedAuthPath = req => String(req.originalUrl || '').split('?')[0].replace(/\/{2,}/g, '/');
const isAuthRateLimitedPath = req => /^\/api\/auth\/(?:register|login|forgot-password|reset-password)(?:\/|$)/i.test(normalizedAuthPath(req));

const authLimiter = createRateLimiter(
  AUTH_RATE_LIMIT_WINDOW_MS,
  AUTH_RATE_LIMIT_MAX_REQUESTS,
  'Demasiados intentos de autenticación. Intenta de nuevo en un minuto.',
  'AUTH_RATE_LIMIT_EXCEEDED',
  redisAuthStore,
  req => !isAuthRateLimitedPath(req)
);
const contactLimiter = createRateLimiter(
  CONTACT_RATE_LIMIT_WINDOW_MS,
  CONTACT_RATE_LIMIT_MAX_REQUESTS,
  'Demasiados mensajes. Intenta de nuevo más tarde.',
  'CONTACT_RATE_LIMIT_EXCEEDED',
  redisContactStore,
);

// Parseo de body
app.use(express.json({ limit: '256kb', strict: true }));
app.use(express.urlencoded({ extended: false, limit: '256kb' }));

// Cookie Parser
app.use(cookieParser());
app.use(csrfProtection);

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'API By Jers funcionando',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
  });
});

// CSP Report endpoint (si está habilitado)
if (CSP_REPORT_ONLY && CSP_REPORT_URI) {
  app.post('/api/csp-report', express.json({ type: 'application/csp-report' }), (req, res) => {
    console.warn('CSP Violation recibida', { requestId: req.requestId });
    res.status(204).end();
  });
}

// ==========================================
// RUTAS PRINCIPALES
// ==========================================
app.use('/api/auth', authLimiter, routes.auth);
app.use('/api/products', routes.products);
app.use('/api/cart', routes.cart);
app.use('/api/orders', routes.orders);
app.use('/api/users', routes.users);
app.use('/api/contact', contactLimiter, routes.contact);
app.use('/api/admin', routes.admin);

// Middleware 404
app.use(notFound);

// Middleware global de errores
app.use(errorHandler);

// Graceful shutdown
const shutdown = async (signal) => {
  console.log(`\n${signal} recibido. Cerrando servidor...`);
  if (httpServer) {
    await new Promise(resolve => httpServer.close(resolve));
  }
  if (redisClient?.isOpen) {
    await redisClient.quit();
  }
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

/**
 * Inicia el servidor conectando primero a MongoDB
 */
export const startServer = async () => {
  try {
    validateSecurityEnvironment();
    await connectDB();
    httpServer = app.listen(PORT, HOST, () => {
      console.log(`
╔════════════════════════════════════════════════════════════╗
║  🚀 By Jers Backend corriendo en puerto ${PORT}            ║
║  📦 Entorno: ${NODE_ENV.padEnd(40)} ║
║  🔗 Frontend: ${FRONTEND_URL.padEnd(40)} ║
║  🔒 CSP: ${CSP_NONCE_ENABLED ? 'Enabled (nonce)' : 'Standard'}${(' ').repeat(35)} ║
║  📊 Rate Limit: ${REDIS_ENABLED ? 'Redis' : 'Memory'}${(' ').repeat(38)} ║
╚════════════════════════════════════════════════════════════╝
      `);
    });
    httpServer.requestTimeout = 15000;
    httpServer.headersTimeout = 10000;
    httpServer.keepAliveTimeout = 5000;
  } catch (error) {
    console.error('Error iniciando servidor', { name: error.name });
    process.exit(1);
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer();
}

export { app };
export default app;