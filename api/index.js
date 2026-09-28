/**
 * api/index.js - Punto de entrada de la API en Vercel (Serverless Function)
 *
 * Vercel importa este archivo y usa el export por defecto como handler.
 *
 * ¿Por qué un import dinámico dentro de try/catch?
 * `backend/src/config/env.js` valida la configuración de producción y hace
 * `throw` a nivel de módulo si falta algo (JWT_SECRET corto, MONGODB_URI en
 * localhost, SMTP ausente...). En un entorno serverless eso aborta el import y
 * Vercel devuelve un 500 sin explicar nada. Con este envoltorio la API contesta
 * con un mensaje que dice exactamente qué revisar, y el sitio estático —que lo
 * sirve Vercel por separado— nunca se ve afectado.
 *
 * Una vez las variables de entorno estén bien configuradas, este archivo
 * devuelve la app normal sin cambiar nada más.
 */
// Configuración de la función serverless. `vercel.json` ya declara la clave
// "functions" con maxDuration, pero se replica aquí porque el handler se puede
// desplegar fuera de Vercel (o con esa clave ausente) y entonces este export
// es el único que fija el límite de ejecución.
export const config = { maxDuration: 30 };

let app = null;
let problemaConfig = null;

try {
  ({ default: app } = await import('../backend/src/app.js'));
} catch (error) {
  problemaConfig = error;
  console.error('No se pudo iniciar la API:', error.message);
}

// Errores de configuración que la app lanza al importarse. Se listan porque son
// los causantes habituales la primera vez que se despliega.
const PISTAS = {
  MONGODB_URI: 'Falta MONGODB_URI válido (debe ser mongodb+srv:// de MongoDB Atlas en producción)',
  JWT_SECRET: 'Falta JWT_SECRET de al menos 64 caracteres aleatorios',
  REDIS: 'Falta REDIS_URL con rediss:// (Upstash) o REVISA REDIS_ENABLED',
  SMTP: 'Faltan SMTP_HOST, SMTP_USER y SMTP_PASS',
  ORIGIN: 'FRONTEND_URL / FRONTEND_ALLOWED_ORIGINS / API_ORIGIN deben ser URLs https:// del dominio real',
  COOKIE: 'COOKIE_SECURE debe ser true en producción',
  TRUST_PROXY: 'TRUST_PROXY_HOPS debe ser 1 en Vercel',
  SECRETS: 'SECRETS_FROM_ENV debe ser true en Vercel',
  HOST: 'HOST debe ser 0.0.0.0 en Vercel',
};

const pistasPara = mensaje => Object.entries(PISTAS)
  .filter(([clave]) => {
    const texto = mensaje.toLowerCase();
    if (clave === 'MONGODB_URI') return /mongodb/i.test(texto);
    if (clave === 'JWT_SECRET') return /jwt_secret/i.test(texto);
    if (clave === 'REDIS') return /redis/i.test(texto);
    if (clave === 'SMTP') return /smtp/i.test(texto);
    if (clave === 'ORIGIN') return /origin|frontend_url|https/i.test(texto);
    if (clave === 'COOKIE') return /cookie/i.test(texto);
    if (clave === 'TRUST_PROXY') return /trust_proxy/i.test(texto);
    if (clave === 'SECRETS') return /secrets_from_env|\.env/i.test(texto);
    if (clave === 'HOST') return /host/i.test(texto);
    return false;
  })
  .map(([, texto]) => texto);

export default async function handler(req, res) {
  // Vercel enruta /api/health -> /api?path=health, así que la subruta viaja en
  // la query. Sin esto Express recibiría "/api" y no encontraría /api/health.
  const subruta = req.query?.path;
  if (subruta) {
    const limpio = Array.isArray(subruta) ? subruta.join('/') : String(subruta);
    req.url = `/api/${limpio}${req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`;
  }

  if (!app) {
    const detalle = problemaConfig?.message || 'La API no pudo iniciar.';
    return res.status(503).json({
      success: false,
      message: 'La API todavía no está configurada para producción.',
      code: 'API_CONFIG_INCOMPLETA',
      error: detalle,
      revisar: pistasPara(detalle),
      ayuda: 'Project > Settings > Environment Variables en Vercel. Ver backend/.env.example.',
    });
  }
  return app(req, res);
}
