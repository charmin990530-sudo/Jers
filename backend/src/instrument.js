/**
 * instrument.js - Instrumentación de Sentry
 *
 * POR QUÉ IMPORTA EL ORDEN DE ESTE IMPORT
 * ---------------------------------------
 * Este módulo se importa el primero en `app.js` a propósito: Sentry tiene que
 * estar inicializado antes de que cualquier otro módulo pueda lanzar para
 * capturar el error de arranque.
 *
 * El problema es que ANTES leía el entorno con `process.env` directamente, y en
 * ESM los módulos se evalúan en el orden de los `import`. Es decir: cuando este
 * archivo se ejecutaba, `config/env.js` todavía no había corrido, y `env.js` es
 * el único que hace `dotenv.config()`. Con los valores de Sentry y de NODE_ENV
 * solo en el archivo `.env` (self-hosted, Docker, `npm start`), ambas variables
 * eran `undefined` en ese instante, `Sentry.init()` nunca se llamaba y el
 * monitoreo quedaba desactivado SIN NINGÚN AVISO.
 *
 * En Vercel funcionaba, porque la plataforma inyecta `NODE_ENV=production` y el
 * DSN como variables de proceso reales antes de importar nada.
 *
 * La solución es importar los valores de `config/env.js` en vez de leerlos a
 * mano. No introduce un ciclo: `env.js` no importa nada del proyecto, solo lee el
 * `.env` y valida. Y ahora, si la configuración es inválida, el error salta
 * durante la evaluación de este módulo, con Sentry ya inicializado y por tanto
 * reportado.
 */
import * as Sentry from '@sentry/node';
import { SENTRY_DSN, NODE_ENV, SENTRY_TRACES_SAMPLE_RATE } from './config/env.js';

if (SENTRY_DSN && NODE_ENV === 'production') {
  try {
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: NODE_ENV,
      tracesSampleRate: SENTRY_TRACES_SAMPLE_RATE,
      // NO incluir datos personales: los errores llegan con la URL y el estado,
      // nunca con el cuerpo de la petición ni con el email del usuario.
      sendDefaultPii: false,
      // Aviso explícito: antes, el fallo silencioso de esta inicialización era
      // indistinguible de "no hay nada que reportar".
      debug: false,
    });
  } catch (error) {
    // Un DSN malformado no debe tumbar el arranque. Se avisa y se sigue.
    console.error(
      `[sentry] No se pudo inicializar Sentry: ${error?.name || 'Error'}. ` +
      'El proceso sigue arrancando, pero sin monitoreo de errores.',
    );
  }
}

export { Sentry };