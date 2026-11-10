/**
 * app.js - Punto de entrada principal del backend
 * Configura Express, middlewares globales, rutas y arranca el servidor
 */
import './instrument.js';
import express from 'express';
import mongoose from 'mongoose';
import crypto, { randomBytes } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, resolve, join } from 'path';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createClient } from 'redis';
import { Sentry } from './instrument.js';
import { connectDB } from './config/db.js';
import { validateSecurityEnvironment } from './config/env.js';
import { 
  PORT,
  HOST,
  NODE_ENV,
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
  CSP_REPORT_URI,
  SENTRY_DSN,
  SERVE_STATIC,
  FAIL_FAST_ON_DB_ERROR,
  HEALTH_DETAIL_TOKEN,
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

// Sentry se inicializa en instrument.js (importado arriba)

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

if (REDIS_ENABLED) {
  redisClient = createClient({
    url: REDIS_URL,
    socket: {
      connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
      // Reconexión indefinida con espera creciente y techo.
      //
      // Antes era `retries => retries > 3 ? false : ...`: devolviendo `false`,
      // node-redis deja de reintentar PARA SIEMPRE. Un corte de red de cinco
      // segundos en Upstash bastaba para que `isOpen` quedara en `false` de
      // forma permanente, y con el store lanzando excepción eso significaba 500
      // en todo `/api/*` hasta el siguiente despliegue.
      //
      // `Math.min` sin tope es un problema aparte: 6 reintentos ya son 12 s de
      // espera por reintento y se convierte en una suma de horas al día. El
      // techo de 5 s mantiene la recuperación rápida sin martillear a Redis.
      reconnectStrategy: retries => Math.min(retries * 200, 5000),
    },
    // Sin esto, con Redis inalcanzable los comandos se encolan sin límite y la
    // petición se queda colgada hasta el timeout del servidor en vez de fallar
    // rápido y degradar.
    disableOfflineQueue: true,
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
//
// Ya no está fonts.googleapis.com: las tipografías se sirven desde el repo
// (font/, declaradas en css/fuentes.css). Ver B-35 en css/fuentes.css, que
// explica por qué el arreglo clásico con onload= no valía aquí: la CSP bloquea
// los manejadores inline. Por eso CDN_STYLES se queda vacío; si algún día
// vuelve a hacer falta un CSS externo, hay que volver a añadir el dominio AQUÍ y
// en vercel.json, porque las dos CSP tienen que seguir coincidiendo.
const CDN_SCRIPTS = ['https://cdn.jsdelivr.net'];
const CDN_STYLES = [];

// ==========================================
// CSP — por que hay otra en vercel.json (B-26)
// ==========================================
//
// SON DOS, Y NO SE PUEDE DEJAR UNA SOLA.
//
// - Esta (helmet) es la unica que corre cuando Express sirve el sitio: en local y
//   en cualquier despliegue propio. Ademas es la unica que puede leer del
//   entorno `API_ORIGIN` y `FRONTEND_ALLOWED_ORIGINS`, porque una cabecera
//   estatica de Vercel no interpola variables.
// - La de `vercel.json` es la unica que aplica al sitio publicado en Vercel:
//   alla el HTML, el CSS y el JS los sirve el edge desde `frontend/public/` y
//   Express no se ejecuta para esas peticiones. Sin ella, las paginas no
//   tendrian CSP.
//
// En un despliegue en Vercel, las respuestas de /api llevan las dos (el
// navegador se queda con la mas restrictiva de todas las que reciba) y las del
// sitio llevan solo la de vercel.json. Por eso van alineadas directiva por
// directiva; lo que faltaba en la de Vercel (frame-src, script-src-attr y
// upgrade-insecure-requests) se le anadio alli.
//
// `connect-src` es la unica que no se puede alinear, porque vercel.json no lee
// el entorno. Y no hace falta: frontend/js/config.js deriva la URL de la API de
// `window.location.origin`, sin ningun host escrito, de modo que en Vercel la
// API siempre es same-origin y `'self'` es completo.
//
// `script-src-attr 'none'` y `frame-src 'none'` no rompen nada: el sitio no usa
// manejadores `onclick=` en linea ni iframes (comprobado en las 22 paginas), y
// los eventos van por addEventListener desde js/.
const cspDirectives = (nonce, conexionSegura) => ({
  defaultSrc: ["'self'"],
  scriptSrc: nonce ? ["'self'", `'nonce-${nonce}'`, ...CDN_SCRIPTS] : ["'self'", ...CDN_SCRIPTS],
  styleSrc: ["'self'", "'unsafe-inline'", ...CDN_STYLES],
  // Sin fonts.gstatic.com: las tipografías son del mismo origen (B-35).
  fontSrc: ["'self'", 'data:'],
  imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
  connectSrc: ["'self'", API_ORIGIN, ...FRONTEND_ALLOWED_ORIGINS],
  frameSrc: ["'none'"],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
  frameAncestors: ["'none'"],
  // `upgrade-insecure-requests` SOLO cuando la conexion es segura.
  //
  // helmet la pone en sus directivas por defecto (helmet/index.cjs,
  // DEFAULT_DIRECTIVES) y asi salia siempre, tambien en local. El problema es
  // que la directiva convierte en `https://` TODOS los recursos http de la
  // pagina: en un despliegue de desarrollo servido por HTTP plano (por ejemplo
  // http://192.168.0.12:3000, que es como se abre la tienda desde el movil o
  // desde otro equipo de la red), el navegador intentaba descargar los JS y el
  // CSS por https:// contra un servidor que no habla TLS, el handshake fallaba
  // y la pagina se quedaba EN BLANCO. Solo en `localhost`/`127.0.0.1` se veia,
  // porque esos origenes son "potentially trustworthy" y el navegador no los
  // sube: por eso el fallo se reproducia en la IP de la red y no en local.
  //
  // Verificado con Chrome headless: en http://127.0.0.1 el DOM renderiza y en
  // http://192.168.0.12 el DOM llega vacio con "handshake failed" en consola.
  //
  // Con `null` helmet elimina la directiva (y su valor por defecto). En
  // produccion, donde todo va por HTTPS, se mantiene: `req.secure` es true
  // porque hay un proxy delante y `trust proxy` esta configurado.
  upgradeInsecureRequests: conexionSegura ? [] : null,
});

/**
 * ¿La peticion ha llegado por HTTPS?
 *
 * `req.secure` ya tiene en cuenta `trust proxy` (TRUST_PROXY_HOPS), que es lo
 * que hace que en Vercel, donde el TLS termina en el proxy, `req.secure` sea
 * true. Se comprueba tambien `x-forwarded-proto` por si el proxy no estuviera
 * declarado, porque de este valor depende que la tienda cargue o no.
 */
const esConexionSegura = req =>
  req.secure === true
  || String(req.get('x-forwarded-proto') || '').split(',')[0].trim() === 'https';

app.use((req, res, next) => {
  const nonce = req.cspNonce || (CSP_NONCE_ENABLED ? randomBytes(16).toString('base64') : null);
  const directives = cspDirectives(nonce, esConexionSegura(req));
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

// El limitador protege la API, no los archivos estaticos. Antes se contaba
// cada peticion: solo cargar la portada hacia 41 peticiones (8 de API y 33 de
// CSS, JS, imagenes y video), asi que tras 3 visitas la web respondia 429 y se
// quedaba sin productos. Los estaticos los sirve Express con cache de
// immutable, no necesitan limite.
const noEsEstatico = req => {
  if (req.path === '/api/health') return false;
  return !req.path.startsWith('/api');
};

const limiter = createRateLimiter(
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_REQUESTS,
  'Demasiadas solicitudes. Intenta de nuevo más tarde.',
  ErrorCodes.RATE_LIMIT_EXCEEDED,
  redisGeneralStore,
  noEsEstatico
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
//
// En producción el detalle va tras autenticación. Antes cualquiera, sin sesión y
// sin límite de peticiones, obtenía la lista exacta de variables de entorno que
// faltaban (`Configuración de seguridad inválida: JWT_SECRET, REDIS_ENABLED,
// MONGODB_URI_TLS, COOKIE_SECURE, .env permissions`) más el estado de Redis y del
// entorno. No son secretos, pero es reconocimiento gratuito de la topología de
// despliegue, y la redacción que existe (`redactConfig`) no se aplicaba aquí.
//
// Por defecto `HEALTH_DETAIL_TOKEN` es vacío, así que en producción no se publica
// nada sin el token. Si no se define, la sonda solo responde "vivo o no vivo",
// que es lo que necesitan por igual Vercel, un balanceador o un uptime monitor.
const healthToken = HEALTH_DETAIL_TOKEN;
const healthConDetalle = req => {
  if (NODE_ENV !== 'production') return true;
  if (!healthToken) return false;
  const supplied = String(req.get('x-health-token') || '');
  // Comparación en tiempo constante: comparar con `===` filtra information por
  // temporización, y un token de sonda no merece ser adivinable.
  const a = Buffer.from(supplied);
  const b = Buffer.from(healthToken);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

app.get('/api/health', (req, res) => {
  const conDetalle = healthConDetalle(req);
  // Sin token en producción no se expone NADA además del success/timestamp:
  // antes el fallback `environment` filtraba NODE_ENV a cualquier sonda anónima.
  res.json({
    success: true,
    message: 'API By Jers funcionando',
    timestamp: new Date().toISOString(),
    ...(conDetalle ? {
      environment: NODE_ENV,
      database: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown',
      redis: redisClient?.isOpen ? 'connected' : (REDIS_ENABLED ? 'unavailable' : 'disabled'),
      configured: !configError,
      // Redactado, no crudo: la función existe para esto y no se aplicaba.
      ...(configError ? { configError: redactConfig(configError.message) } : {}),
    } : {}),
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
// `frontend/public/` es la carpeta de salida de `scripts/preparar-estatico.mjs`;
// los originales viven en `frontend/` y el build los copia. `npm start` reconstruye
// antes de arrancar, asi que lo servido nunca queda desfasado del fuente.
//
// Se registra DESPUES de las rutas de la API para que ninguna peticion /api/*
// pueda acabar sirviendo un archivo estatico por error, y el 404 de API se
// limita a /api/* para que el resto de rutas las atienda la pagina 404 del sitio.
const PUBLIC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../frontend/public');

// Lo que no debe servirse como archivo estatico aunque alguien lo dejara dentro
// de frontend/public/.
//
// `.json` NO va a proposito, y conviene no añadirlo: `data/producto-destacado.json`
// lo lee js/bienvenida.js y se sirve hoy (HTTP 200). Bloquear los .json rompe la
// pagina de bienvenida. Lo que hay que impedir es la basura sensible: el .env, los
// logs, el lockfile y un node_modules que alguien copiara dentro.
// (El .env real y el package.json estan en la raiz y en backend/, fuera de
// frontend/public/, asi que express.static no puede verlos de todos modos.)
const STATIC_DENY = /\.(?:env|log|lock)$|^\.|^node_modules\//i;


// 404 de la API: JSON, como espera cualquier cliente de API.
app.use('/api', notFound);

if (SERVE_STATIC) {
  // 404 del sitio. Se reutiliza en los dos sitios que hacen falta: al final de
  // la cadena, y cuando STATIC_DENY deniega un archivo.
  const pagina404 = (req, res) => {
    res.status(404).sendFile(join(PUBLIC_DIR, '404.html'), err => {
      if (err) {
        res.status(404).type('text/plain; charset=utf-8')
          .send('404 - Pagina no encontrada. Regenera frontend/public/ con: node scripts/preparar-estatico.mjs');
      }
    });
  };

  // Barrera real, y va ANTES de express.static a proposito: despues ya estarian
  // los bytes en camino. Antes solo se comprobaba STATIC_DENY en la ruta de HTML
  // abreviado, que es donde no podia llegar a hacer nada (su expresion regular
  // solo acepta [a-z0-9_-] por segmento, asi que ningun path con punto — que es
  // justo lo que STATIC_DENY busca — llega a esa ruta). Verificado con la
  // expresion real de ambas: no hay ningun path que las satisfaga a las dos.
  app.use((req, res, next) => {
    if (!STATIC_DENY.test(req.path)) return next();
    // Denegado: NO se sirve y NO se pasa a express.static. Un `next()` aqui
    // dejaria el archivo served igual, que es justo el bug que se arregla.
    return pagina404(req, res);
  });

  const staticOptions = {
    // Los .html/.css/.js se revalidan siempre: si se corrige una pagina y se
    // reinicia, el navegador no debe quedarse con la version vieja cacheada.
    setHeaders: (res, filePath) => {
      if (/\.(?:html|css|js)$/.test(filePath)) {
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      }
    },
    // `dotfiles: 'deny'` cubre el caso de un archivo que empieza por punto; lo
    // pone tambien STATIC_DENY, pero por separado: este es comportamiento de
    // serve-static y el otro es nuestro, por si se cambia la opcion.
    dotfiles: 'deny',
    // Si el archivo no esta o esta denegado, la peticion sigue hasta la pagina
    // 404 del sitio en vez de cortar aqui.
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
  // [a-z0-9_-]. Ese filtro es la barrera de verdad de esta ruta, y por eso aqui
  // no hace falta STATIC_DENY: como `..` no puede pasar, no hay forma de subir de
  // directorio ni de pedir un archivo con punto, extension o no.
  app.get(/^\/[a-z0-9_-]+(?:\/[a-z0-9_-]+)*$/i, (req, res, next) => {
    const relativo = `${req.path.slice(1)}.html`;
    const destino = join(PUBLIC_DIR, relativo);
    // Defensa extra: el destino resuelto tiene que seguir dentro de frontend/public/.
    if (!destino.startsWith(PUBLIC_DIR)) return next();
    res.sendFile(destino, err => { if (err) next(); });
  });

  // Fallback de la SPA Angular: las rutas del router deben devolver index.html
  // al abrirse o recargarse directamente (por ejemplo /catalogo/maquillaje).
  // Los recursos con extensión siguen pasando al 404 estático para no devolver
  // HTML cuando falte un .js, .css, imagen u otro archivo.
  app.get(/.*/, (req, res, next) => {
    if (!req.accepts('html') || /\/[^/]*\.[^/]*$/.test(req.path)) return next();
    res.sendFile(join(PUBLIC_DIR, 'index.html'), err => { if (err) next(); });
  });

  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/api/')) return next();
    pagina404(req, res);
  });
} else {
  app.use(notFound);
}

// Sentry error handler (debe ir después de las rutas, antes del errorHandler propio)
if (SENTRY_DSN && NODE_ENV === 'production') {
  app.use(Sentry.setupExpressErrorHandler(app));
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

  const failFast = FAIL_FAST_ON_DB_ERROR;
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
