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
import { validarSubruta, INVALID_API_PATH } from '../backend/src/utils/validar-subruta.js';

// Configuración de la función serverless. `vercel.json` ya declara la clave
// "functions" con maxDuration, pero se replica aquí porque el handler se puede
// desplegar fuera de Vercel (o con esa clave ausente) y entonces este export
// es el único que fija el límite de ejecución.

export const config = { maxDuration: 30 };

let app = null;

try {
  ({ default: app } = await import('../backend/src/app.js'));
} catch (error) {
  console.error('No se pudo iniciar la API', { name: error.name });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  // Vercel enruta /api/health -> /api?path=health, así que la subruta viaja en
  // la query. Sin esto Express recibiría "/api" y no encontraría /api/health.
  //
  // La subruta se valida ANTES de reescribir `req.url` (B-33). El patrón y el
  // motivo están en backend/src/utils/validar-subruta.js para poder probarse sin
  // arrancar la app: importar este archivo ejecuta el `await import` de la app.
  const subruta = req.query?.path;
  if (subruta) {
    const limpio = Array.isArray(subruta) ? subruta.join('/') : String(subruta);
    const valida = validarSubruta(limpio);
    if (!valida.ok) {
      return res.status(400).json({
        error: { code: INVALID_API_PATH, message: valida.mensaje },
      });
    }
    req.url = `${valida.ruta}${req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`;
  }

  if (!app) {
    return res.status(503).json({
      error: { code: 'API_NOT_CONFIGURED', message: 'La API no está disponible temporalmente.' },
    });
  }
  return app(req, res);
}
