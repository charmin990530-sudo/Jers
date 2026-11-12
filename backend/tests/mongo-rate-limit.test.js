import mongoose from 'mongoose';
import MongoRateLimitStore from '../src/middleware/mongoRateLimitStore.js';

const createStore = prefix => {
  const store = new MongoRateLimitStore({ prefix, getConnection: async () => mongoose.connection });
  store.init({ windowMs: 60000 });
  return store;
};

describe('Límites distribuidos en MongoDB', () => {
  it('cuenta solicitudes simultáneas sin perder incrementos entre instancias', async () => {
    const a = createStore('shared:'), b = createStore('shared:');
    const values = await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 ? a : b).increment('client')));
    expect(values.map(v => v.totalHits).sort((x, y) => x - y)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(new Set(values.map(v => v.resetTime.getTime())).size).toBe(1);
  });

  it('reinicia una ventana expirada aunque TTL todavía no haya borrado el registro', async () => {
    const store = createStore('expire:');
    await store.increment('client');
    await mongoose.connection.collection('rate_limits').updateOne({ _id: store.key('client') }, { $set: { resetAt: new Date(0), hits: 20 } });
    const value = await store.increment('client');
    expect(value.totalHits).toBe(1); expect(value.resetTime.getTime()).toBeGreaterThan(Date.now());
  });

  it('aísla los límites de login, contacto y navegación', async () => {
    const a = createStore('auth:'), b = createStore('general:');
    await a.increment('same-client'); await a.increment('same-client');
    expect((await b.increment('same-client')).totalHits).toBe(1);
  });

  it('decrementa sin valores negativos y permite restablecer una clave', async () => {
    const store = createStore('reset:'); await store.increment('client');
    await store.decrement('client'); await store.decrement('client');
    expect((await store.increment('client')).totalHits).toBe(1);
    await store.resetKey('client'); expect((await store.increment('client')).totalHits).toBe(1);
  });

  it('protege el acceso si la base no está disponible y no guarda IP en texto', async () => {
    const store = new MongoRateLimitStore({ getConnection: async () => null });
    expect(store.key('192.0.2.8')).not.toContain('192.0.2.8');
    await expect(store.increment('client')).rejects.toMatchObject({ statusCode: 503 });
  });
});

describe('Respaldo seguro de Redis', () => {
  it('sigue limitando mediante MongoDB cuando Redis está caído', async () => {
    const {default:RedisStore}=await import('../src/middleware/redisRateLimitStore.js');
    const {default:express}=await import('express');
    const {default:rateLimit}=await import('express-rate-limit');
    const {default:request}=await import('supertest');
    const store=new RedisStore({client:{isOpen:false},fallbackStore:createStore('redis-fallback-test:')});
    const app=express();app.use(rateLimit({windowMs:60000,limit:1,store}));app.get('/',(_,res)=>res.json({ok:true}));
    await request(app).get('/').expect(200);await request(app).get('/').expect(429);
  });
  it('rechaza temporalmente si no existe un respaldo disponible',async()=>{
    const {default:RedisStore}=await import('../src/middleware/redisRateLimitStore.js');
    const store=new RedisStore({client:{isOpen:false}});store.init({windowMs:1000});
    await expect(store.increment('ficticio')).rejects.toMatchObject({statusCode:503});
  });
});
