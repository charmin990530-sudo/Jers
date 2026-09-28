/**
 * app.js - Punto de entrada principal del backend
 * Configura Express, middlewares globales, rutas y arranca el servidor
 */
import express from 'express';
import mongoose from 'mongoose';
import { randomBytes } from 'crypto';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, resolve, join } from 'path';
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
  REDIS_CONNECT_TIMEOUT_MS,
  TRUST_PROXY_HOPS,
  CSP_NONCE_ENABLED,
  CSP_REPORT_ONLY,
  CSP_REPORT_URI
} from './config/env.js';
import { routes } from './routes/index.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import { ErrorCodes, sendError, buildErrorBody } from './middleware/apiError.js';
import RedisRateLimitStore from './middleware/redisRateLimitStore.js';
import { securityMiddleware, csrfProtection } from './middleware/security.js';

// El detalle de la configuración incompleta puede incluir el nombre de una
// variable, nunca su valor. Se limita a un solo campo para no filtrar el
// contenido del archivo .env.
const redactConfig = message => String(message || 'Configuracion de produccion incompleta').slice(0, 300);

const app = express();
app.disable('x-powered-by');
if (TRUST_PROXY_HOPS > 0) app.set('trust proxy', TRUST_PROXY_HOPS);

// En un entorno serverless, un throw a nivel de módulo tumba TODAS las
// peticiones con un 500 opaco. Por eso la validación se captura y se reporta
// desde un middleware: el sitio estático sigue sirviéndose y la API dice
// exactamente qué variable falta.
let configError = null;
if (NODE_ENV === 'production') {
  try {
    validateSecurityEnvironment();
  } catch (error) {
    configError = error;
    console.error('Configuración de producción incompleta:', error.message);
  }
}
let httpServer = null;

// ==========================================
// REDIS CLIENT (para rate limiting en producción)
// ==========================================
let redisClient = null;
let redisGeneralStore = null;
let redisAuthStore = null;
let redisContactStore = null;
let redisError = null;

if (REDIS_ENABLED) {
  redisClient = createClient({
    url: REDIS_URL,
    // Sin esto el cliente reintenta para siempre y un REDIS_URL inalcanzable
    // deja el cold start colgado hasta que Vercel lo corta por timeout.
    socket: {
      connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
      reconnectStrategy: retries => (retries > 3 ? false : Math.min(retries * 200, 1000)),
    },
  });
  redisClient.on('error', err => console.error('Redis Client Error', { name: err.name }));
  try {
    await redisClient.connect();
    redisGeneralStore = new RedisRateLimitStore({ client: redisClient, prefix: 'rl:general:' });
    redisAuthStore = new RedisRateLimitStore({ client: redisClient, prefix: 'rl:auth:' });
    redisContactStore = new RedisRateLimitStore({ client: redisClient, prefix: 'rl:contact:' });
  } catch (error) {
    // Sin Redis se cae al store en memoria: menos estricto, pero la API
    // sigue respondiendo en vez de desaparecer por completo.
    redisError = error;
    // `disconnect()` es async y lanza ClientClosedError cuando el socket nunca
    // llegó a abrir (justo este caso, el de Redis caído). Sin await el
    // try/catch no lo captura, el rechazo queda sin manejar y tumba el proceso
    // en vez de degradar a rate limit en memoria. Mismo patrón que shutdown().
    try {
      if (redisClient.isOpen) await redisClient.disconnect();
    } catch { /* ya estaba cerrado */ }
    redisClient = null;
    redisGeneralStore = null;
    redisAuthStore = null;
    redisContactStore = null;
    console.error('Redis no disponible, se usara rate limit en memoria:', error.message);
  }
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

// Dominios externos que el sitio carga de verdad. Deben coincidir con los que
// usan las cabeceras de Vercel (vercel.json), o el sitio funciona en un
// despliegue y da errores de consola en el otro.
//
// - cdn.jsdelivr.net: GSAP y ScrollTrigger, que carga bienvenida.html.
// - fonts.googleapis.com: los CSS de las tipografías (eso va en style-src).
const CDN_SCRIPTS = ['https://cdn.jsdelivr.net'];
const CDN_STYLES = ['https://fonts.googleapis.com'];

const cspDirectives = nonce => ({
  defaultSrc: ["'self'"],
  scriptSrc: nonce ? ["'self'", `'nonce-${nonce}'`, ...CDN_SCRIPTS] : ["'self'", ...CDN_SCRIPTS],
  styleSrc: ["'self'", "'unsafe-inline'", ...CDN_STYLES],
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

// La CORS acepta además el propio origen del servidor: el sitio lo sirve este
// mismo backend, así que su página es same-origin por definición. Sin esto, la
// cabecera Access-Control-Allow-Origin no volvía y el navegador bloqueaba la
// respuesta de las peticiones que mutan.
const esMismoServidor = (origin, req) => {
  try {
    const host = req.get('host');
    return !!host && new URL(origin).host === host;
  } catch {
    return false;
  }
};
const isAllowedOrigin = (origin, req) => !origin
  || FRONTEND_ALLOWED_ORIGINS.includes(origin)
  || esMismoServidor(origin, req);

// Forma delegada (`cors(fn)`) en vez de `cors({...})`: el callback de `origin`
// solo recibe el origen, y aquí hace falta la petición para comparar el host y
// reconocer el propio origen del servidor.
app.use(cors((req, callback) => {
  const origin = req.get('origin');
  callback(null, {
    origin: isAllowedOrigin(origin, req),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-Token', 'Idempotency-Key'],
  });
}));

app.use(securityMiddleware);

// ==========================================
// RATE LIMITING: Configuración
// ==========================================
// `message` es un objeto, no una funcion: express-rate-limit lo emite tal cual en
// el cuerpo de la respuesta, asi que se reutiliza el sobre de error de la API en
// lugar del { message } pelado que devolvia antes.
const createRateLimiter = (windowMs, max, message, code, store = undefined, skip = () => false) => {
  const config = {
    windowMs,
    limit: max,
    message: buildErrorBody(code, message),
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
  ErrorCodes.RATE_LIMIT_EXCEEDED,
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
  ErrorCodes.AUTH_RATE_LIMIT_EXCEEDED,
  redisAuthStore,
  req => !isAuthRateLimitedPath(req)
);
const contactLimiter = createRateLimiter(
  CONTACT_RATE_LIMIT_WINDOW_MS,
  CONTACT_RATE_LIMIT_MAX_REQUESTS,
  'Demasiados mensajes. Intenta de nuevo más tarde.',
  ErrorCodes.CONTACT_RATE_LIMIT_EXCEEDED,
  redisContactStore,
);

// Parseo de body
app.use(express.json({ limit: '256kb', strict: true }));
app.use(express.urlencoded({ extended: false, limit: '256kb' }));

// Cookie Parser
app.use(cookieParser());
app.use(csrfProtection);

// Health Check
// No depende de la base a proposito: sirve como sonda de vida del proceso.
// `database`, `redis` y `configured` reflejan el estado real para poder
// diagnosticar un despliegue sin tener que mirar los logs.
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'API By Jers funcionando',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    database: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown',
    redis: redisClient?.isOpen ? 'connected' : (REDIS_ENABLED ? 'unavailable' : 'disabled'),
    configured: !configError,
    ...(configError ? { configError: configError.message } : {}),
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
// En un entorno serverless (Vercel) el módulo se importa por cada petición y
// startServer() nunca llega a ejecutarse, así que la conexión se abre aquí de
// forma perezosa. connectDB() reutiliza la conexión existente, por lo que en
// las siguientes peticiones es prácticamente un no-op.
//
// Se aplica SOLO a /api/*. Si Mongo está caído, un archivo estático se sirve
// igual e inmediato: antes este middleware corría también para el HTML y cada
// carga de página esperaba los 10 s de serverSelectionTimeoutMS para terminar
// mostrando... la página. Con Mongo abajo el sitio se ve, aunque el catálogo
// muestre su estado de error.
app.use('/api', async (req, res, next) => {
  if (configError) {
    return sendError(res, 503, ErrorCodes.CONFIG_INCOMPLETA, 'La API no está configurada para producción todavía.', {
      details: [{ field: 'config', message: redactConfig(configError.message) }],
    });
  }
  try {
    const connected = await connectDB({ allowRetry: true });
    if (!connected) {
      return sendError(res, 503, ErrorCodes.DATABASE_UNAVAILABLE, 'La base de datos no está disponible en este momento.');
    }
    return next();
  } catch {
    return sendError(res, 503, ErrorCodes.DATABASE_UNAVAILABLE, 'La base de datos no está disponible en este momento.');
  }
});

app.use('/api/auth', authLimiter, routes.auth);
app.use('/api/products', routes.products);
app.use('/api/cart', routes.cart);
app.use('/api/orders', routes.orders);
app.use('/api/users', routes.users);
app.use('/api/contact', contactLimiter, routes.contact);
app.use('/api/admin', routes.admin);

// ==========================================
// SITIO ESTÁTICO (mismo origen que la API)
// ==========================================
// La API y el sitio se sirven desde el MISMO puerto. Consecuencias:
//   - el navegador solo habla con un origen, asi que no hay CORS que configurar
//     ni preflight en cada peticion: la cookie de sesion viaja sin credenciales
//     cruzadas y SameSite funciona como se espera.
//   - no existe ya el segundo servidor (frontend-server.js) con su propio puerto,
//     que era el origen del desfase de puertos entre back y front.
// `public/` es la carpeta de salida de `scripts/preparar-estatico.mjs`; los
// originales viven junto al codigo y el build los copia. `npm start` reconstruye
// antes de arrancar, asi que lo servido nunca queda desfasado del fuente.
//
// Se registra DESPUES de las rutas de la API para que ninguna peticion /api/*
// pueda acabar sirviendo un archivo estatico por error, y el 404 de API se
// limita a /api/* para que el resto de rutas las atienda la pagina 404 del sitio.
const PUBLIC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../public');
const STATIC_DENY = /\.(?:env|log|json|lock)$|^\.|^node_modules\//i;
const SERVE_STATIC = process.env.SERVE_STATIC !== 'false';

// 404 de la API: JSON, como espera cualquier cliente de API.
app.use('/api', notFound);

if (SERVE_STATIC) {
  const staticOptions = {
    // Los .html/.css/.js se revalidan siempre: si se corrige una pagina y se
    // reinicia, el navegador no debe quedarse con la version vieja cacheada.
    setHeaders: (res, filePath) => {
      if (/\.(?:html|css|js)$/.test(filePath)) {
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      }
    },
    dotfiles: 'deny',
    // Segunda barrera: aunque algo se colara en public/, .env y package.json
    // no se sirven nunca.
    fallthrough: true,
    index: false,
  };

  app.use(express.static(PUBLIC_DIR, staticOptions));

  // Raiz -> index.html (express.static con index:false no lo hace).
  app.get('/', (req, res, next) => {
    res.sendFile(join(PUBLIC_DIR, 'index.html'), err => { if (err) next(); });
  });

  // HTML abreviado: /carrito -> /carrito.html y /admin/dashboard ->
  // /admin/dashboard.html. Admite varios segmentos, pero SOLO con caracteres
  // [a-z0-9_-]: como `..` no puede pasar el filtro, no hay forma de que este
  // camino suba de directorio aunque se intente.
  app.get(/^\/[a-z0-9_-]+(?:\/[a-z0-9_-]+)*$/i, (req, res, next) => {
    if (STATIC_DENY.test(req.path)) return next();
    const relativo = `${req.path.slice(1)}.html`;
    const destino = join(PUBLIC_DIR, relativo);
    // Defensa extra: el destino resuelto tiene que seguir dentro de public/.
    if (!destino.startsWith(PUBLIC_DIR)) return next();
    res.sendFile(destino, err => { if (err) next(); });
  });

  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/api/')) return next();
    res.status(404).sendFile(join(PUBLIC_DIR, '404.html'), err => {
      if (err) {
        res.status(404).type('text/plain; charset=utf-8')
          .send('404 - Pagina no encontrada. Regenera public/ con: node scripts/preparar-estatico.mjs');
      }
    });
  });
} else {
  app.use(notFound);
}

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
 * Sincroniza los indices declarados en los modelos con los que hay en Mongo.
 *
 * POR QUE NO BASTA CON `autoIndex`
 * ---------------------------------
 * Mongoose construye los indices en `Model.init()`, que es perezoso: solo se
 * dispara al usar el modelo por primera vez. Comprobado en este proyecto:
 * declarados `orders: {estado, createdAt}` y `contacts: {estado, createdAt}`,
 * arranco la API, hice peticiones, y los indices NO estaban en la base. Se
 *Tenian que crear a mano con `syncIndexes()`.
 *
 * Un indice declarado pero no creado no da error en ninguna parte: simplemente
 * no existe, y la consulta que dependia de el se resuelve con un COLLSCAN. Es
 * la forma mas facil de perder rendimiento sin enterarse.
 *
 * En un entorno serverless (Vercel) NO se ejecuta: cada invocacion es un proceso
 * nuevo y construir indices ahi seria trabajo inutil (ademas requiere permisos de
 * escritura en la BD). Ahi los indices se despliegan una vez por adelantado.
 */
const syncModelIndexes = async () => {
  try {
    const { User, Product, Category, Brand, Cart, Order, Contact } = await import('./models/index.js');
    const models = { User, Product, Category, Brand, Cart, Order, Contact };
    for (const [name, model] of Object.entries(models)) {
      await model.syncIndexes();
      console.log(`  [db] indices de ${name} sincronizados`);
    }
  } catch (error) {
    // Un fallo aqui no debe impedir arrancar la API: la app funciona sin indice
    // nuevo, solo que mas lenta. Se avisa para que se investigue.
    console.error('No se pudieron sincronizar los indices:', error.message);
  }
};

/**
 * Inicia el servidor
 *
 * COMO SE COMPORTA SI MONGODB NO ESTA DISPONIBLE
 * -----------------------------------------------
 * Por defecto el servidor ARRANCA IGUAL y deja que cada peticion se arregle
 * sola: el middleware que precede a las rutas llama a `connectDB({allowRetry:
 * true})` y, si falla, responde 503 con `DATABASE_UNAVAILABLE`. Asi el sitio
 * sigue sirviendo el HTML y el catalogo muestra su estado de error con boton de
 * reintentar, en vez de quedarse en blanco.
 *
 * Antes el proceso hacia `process.exit(1)` y no escuchaba nunca: con la base de
 * datos caida no habia ni pagina ni mensaje, solo un refused en el navegador.
 *
 * `FAIL_FAST_ON_DB_ERROR=true` recupera el comportamiento antiguo (suitable si
 * se quiere que el orquestador reinicie el proceso en bucle mientras la base no
 * vuelve).
 */
export const startServer = async () => {
  try {
    validateSecurityEnvironment();
  } catch (error) {
    console.error('Error iniciando servidor', { name: error.name, message: error.message });
    process.exit(1);
  }

  const failFast = process.env.FAIL_FAST_ON_DB_ERROR === 'true';
  try {
    await connectDB();
    await syncModelIndexes();
  } catch (error) {
    if (failFast) {
      console.error('Error iniciando servidor', { name: error.name, message: error.message });
      process.exit(1);
    }
    console.warn(
      `\n  ⚠ No se pudo conectar con MongoDB al arrancar: ${error.message}\n` +
      '    El servidor igualmente escuchara peticiones. Cada ruta que necesite la\n' +
      '    base devolvera 503 DATABASE_UNAVAILABLE y reintentara en la siguiente\n' +
      '    peticion. Arranca MongoDB y recarga la pagina para recuperarte.\n',
    );
  }

  httpServer = app.listen(PORT, HOST, () => {
    const dbOk = mongoose.connection.readyState === 1;
    console.log(`
╔════════════════════════════════════════════════════════════╗
║  🚀 By Jers corriendo en puerto ${PORT}                     ║
║  📦 Entorno: ${NODE_ENV.padEnd(40)} ║
║  🌐 Sitio + API: ${`http://${HOST}:${PORT}`.padEnd(34)} ║
║  🔒 CSP: ${CSP_NONCE_ENABLED ? 'Enabled (nonce)' : 'Standard'}${(' ').repeat(35)} ║
║  📊 Rate Limit: ${REDIS_ENABLED ? 'Redis' : 'Memory'}${(' ').repeat(38)} ║
║  💾 MongoDB: ${dbOk ? 'conectado' : 'SIN CONEXION (503)'} ${(' ').repeat(26)} ║
╚════════════════════════════════════════════════════════════╝
      `);
  });
  httpServer.requestTimeout = 15000;
  httpServer.headersTimeout = 10000;
  httpServer.keepAliveTimeout = 5000;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer();
}

export { app };
export default app;