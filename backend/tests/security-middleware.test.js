import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import app from '../src/app.js';
import { User } from '../src/models/index.js';

const origin = 'http://localhost:5173';

const csrfCookie = response => response.headers['set-cookie']
  .find(value => value.startsWith('jers_csrf='))
  ?.split(';')[0];

describe('Central security middleware', () => {
  it('issues a signed CSRF token and rejects requests without it', async () => {
    const issued = await request(app)
      .get('/api/auth/csrf')
      .set('Origin', origin)
      .set('X-Request-ID', 'security-test-1')
      .expect(200);

    expect(issued.body.csrfToken).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(issued.headers['x-request-id']).toBe('security-test-1');
    expect(issued.headers['x-frame-options']).toBe('DENY');
    expect(issued.headers['x-powered-by']).toBeUndefined();

    const missing = await request(app)
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email: 'nobody@example.com', password: 'bad' })
      .expect(403);
    expect(missing.body.code).toBe('CSRF_TOKEN_INVALID');

    const valid = await request(app)
      .post('/api/auth/login')
      .set('Origin', origin)
      .set('Cookie', csrfCookie(issued))
      .set('X-CSRF-Token', issued.body.csrfToken)
      .send({ email: 'nobody@example.com', password: 'bad' })
      .expect(401);
    expect(valid.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('allows a valid CSRF flow to authenticate', async () => {
    await User.create({
      nombre: 'Security',
      apellido: 'User',
      email: 'security-user@example.com',
      password: 'password123',
      aceptoTerminos: true,
      aceptoPrivacidad: true,
    });
    const issued = await request(app).get('/api/auth/csrf').set('Origin', origin).expect(200);
    const response = await request(app)
      .post('/api/auth/login')
      .set('Origin', origin)
      .set('Cookie', csrfCookie(issued))
      .set('X-CSRF-Token', issued.body.csrfToken)
      .send({ email: 'security-user@example.com', password: 'password123' })
      .expect(200);
    expect(response.body.user.email).toBe('security-user@example.com');
    expect(response.headers['set-cookie'].some(value => value.startsWith('token='))).toBe(true);
  });

  it('rejects ambiguous paths before route handling', async () => {
    const response = await request(app)
      .post('/api/auth//login')
      .set('Origin', origin)
      .send({ email: 'nobody@example.com', password: 'bad' })
      .expect(400);

    expect(response.body.code).toBe('INVALID_PATH');
  });

  it('rejects untrusted origins and unsupported methods', async () => {
    const issued = await request(app).get('/api/auth/csrf').set('Origin', origin).expect(200);
    const token = issued.body.csrfToken;
    const cookie = csrfCookie(issued);

    await request(app)
      .post('/api/auth/login')
      .set('Origin', 'https://attacker.example')
      .set('Cookie', cookie)
      .set('X-CSRF-Token', token)
      .send({ email: 'nobody@example.com', password: 'bad' })
      .expect(403);

    await request(app)
      .trace('/api/health')
      .set('Origin', origin)
      .expect(405);
  });
});
