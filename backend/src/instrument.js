/**
 * Instrumentación Sentry - debe importarse PRIMERO en app.js
 * Sin SENTRY_DSN o fuera de producción: no hace nada.
 */
import * as Sentry from '@sentry/node';

const dsn = process.env.SENTRY_DSN;
const isProduction = process.env.NODE_ENV === 'production';

if (dsn && isProduction) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    // NO incluir datos personales
    sendDefaultPii: false,
  });
}

export { Sentry };
