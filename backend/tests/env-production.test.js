/**
 * Test: env.js carga correctamente en NODE_ENV=production
 * Verifica que no hay ReferenceError por orden de declaración
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '../src/config/env.js');

describe('env.js en producción', () => {
  const baseEnv = {
    NODE_ENV: 'production',
    JWT_SECRET: 'a'.repeat(64) + 'b'.repeat(64),
    MONGODB_URI: 'mongodb+srv://user:pass@cluster.mongodb.net/by-jers',
    FRONTEND_URL: 'https://byjers.com',
    FRONTEND_ALLOWED_ORIGINS: 'https://byjers.com',
    API_ORIGIN: 'https://api.byjers.com',
    REDIS_URL: 'rediss://:pass@redis.example.com:6379',
    REDIS_ENABLED: 'true',
    COOKIE_SECURE: 'true',
    TRUST_PROXY_HOPS: '1',
    SECRETS_FROM_ENV: 'true',
    SMTP_HOST: 'smtp.example.com',
    SMTP_USER: 'user@example.com',
    SMTP_PASS: 'password123',
  };

  test('carga con configuración válida', () => {
    const script = `
      import('${envPath.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}')
        .then(() => console.log('OK'))
        .catch(e => { console.error(e.message); process.exit(1); });
    `;
    
    const output = execFileSync('node', [
      '--input-type=module',
      '-e', script
    ], {
      env: { ...process.env, ...baseEnv },
      timeout: 10000,
    });
    
    expect(output.toString().trim()).toBe('OK');
  });

  test('falla con origen http:// en producción', () => {
    const script = `
      import('${envPath.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}')
        .then(() => { console.log('OK'); process.exit(0); })
        .catch(e => { console.error(e.message); process.exit(1); });
    `;
    
    expect(() => {
      execFileSync('node', [
        '--input-type=module',
        '-e', script
      ], {
        env: {
          ...process.env,
          ...baseEnv,
          FRONTEND_URL: 'http://byjers.com',
          FRONTEND_ALLOWED_ORIGINS: 'http://byjers.com',
        },
        timeout: 10000,
        stdio: 'pipe',
      });
    }).toThrow(/FRONTEND_ALLOWED_ORIGINS debe usar HTTPS/);
  });
});
