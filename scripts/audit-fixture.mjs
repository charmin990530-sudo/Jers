/** Entorno desechable de auditoría. Nunca conecta a la BD configurada del usuario. */
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

export async function startAuditFixture() {
  const memory = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  let server;
  const stop = async () => {
    if (server) {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
    await mongoose.disconnect();
    await memory.stop();
  };
  try {
    const origin = 'http://127.0.0.1:3137';
    Object.assign(process.env, {
      NODE_ENV: 'test', MONGODB_URI: memory.getUri('audit-disposable'), JWT_SECRET: randomBytes(64).toString('hex'),
      HOST: '127.0.0.1', PORT: '3137', FRONTEND_URL: origin, API_ORIGIN: origin, FRONTEND_ALLOWED_ORIGINS: origin,
      COOKIE_SECURE: 'false', COOKIE_SAME_SITE: 'lax', RATE_LIMIT_STORE: 'memory', REDIS_ENABLED: 'false',
      EMAIL_ENABLED: 'false', SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '', SENTRY_DSN: '', SERVE_STATIC: 'true',
      RATE_LIMIT_MAX_REQUESTS: '100000', AUTH_RATE_LIMIT_MAX_REQUESTS: '100000', CONTACT_RATE_LIMIT_MAX_REQUESTS: '100000',
    });
    await mongoose.connect(process.env.MONGODB_URI);
    const models = await import('../backend/src/models/index.js');
    for (const model of Object.values(models)) await model.init();
    const { User, Product, Category, Brand } = models;
    const category = await Category.create({ nombre: 'labios' });
    const brand = await Brand.create({ nombre: 'Marca Ficticia Auditoria' });
    const product = await Product.create({ nombre: 'Labial de auditoria', descripcion: 'Producto ficticio para pruebas aisladas de auditoria.',
      precio: 50000, stock: 20, categoria: category.id, marca: brand.id,
      imagenes: [{ url: '/img/placeholder.svg', esPrincipal: true }], destacado: true });
    const adminEmail = 'audit-admin@example.com';
    const adminPassword = randomBytes(24).toString('base64url');
    await User.create({ nombre: 'Admin', apellido: 'Ficticio', email: adminEmail, password: adminPassword,
      role: 'admin', aceptoTerminos: true, aceptoPrivacidad: true });
    const { app } = await import('../backend/src/app.js');
    await new Promise((resolve, reject) => {
      server = app.listen(3137, '127.0.0.1', resolve);
      server.once('error', reject);
    });
    return { origin, adminEmail, adminPassword, productId: product.id, models, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const fixture = await startAuditFixture();
  console.log('AUDIT_FIXTURE_READY http://127.0.0.1:3137 — MongoDB temporal, correo desactivado');
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await fixture.stop(); process.exit(0); });
}
