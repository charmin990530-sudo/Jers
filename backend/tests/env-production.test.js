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

  test('admite MongoDB compartido y correo desactivado solo mediante opciones explícitas', () => {
    const script = `import('${envPath}').then(m => { m.validateSecurityEnvironment(); console.log('OK'); });`;
    const output = execFileSync('node', ['--input-type=module', '-e', script], {
      env: { ...process.env, ...baseEnv, HOST: '0.0.0.0', JWT_ISSUER: 'by-jers-api', JWT_AUDIENCE: 'by-jers-store', JEST_WORKER_ID: '',
        RATE_LIMIT_STORE: 'mongodb', REDIS_ENABLED: 'false', REDIS_URL: '', EMAIL_ENABLED: 'false', SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '' },
      timeout: 10000, stdio: 'pipe',
    });
    expect(output.toString().trim()).toBe('OK');
  });

  test('sigue rechazando SMTP ausente cuando el correo está habilitado', () => {
    const script = `import('${envPath}').catch(e => { console.error(e.message); process.exit(1); });`;
    expect(() => execFileSync('node', ['--input-type=module', '-e', script], {
      env: { ...process.env, ...baseEnv, EMAIL_ENABLED: 'true', SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '' },
      timeout: 10000, stdio: 'pipe',
    })).toThrow(/SMTP_HOST/);
  });

  test('la recuperación desactivada informa indisponibilidad antes de consultar usuarios', () => {
    const controller = join(__dirname, '../src/controllers/authController.js');
    const script = `const {forgotPassword} = await import('${controller}');
      await new Promise((resolve,reject) => { forgotPassword({body:{email:'demo@example.com'}},{},e => {
        if(e.statusCode===503 && e.code==='EMAIL_UNAVAILABLE') { console.log('OK'); resolve(); } else reject(e);
      }); });`;
    const output = execFileSync('node', ['--input-type=module', '-e', script], {
      env: { ...process.env, ...baseEnv, EMAIL_ENABLED: 'false', SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '' },
      timeout: 10000, stdio: 'pipe',
    });
    expect(output.toString().trim()).toBe('OK');
  });

});

describe('Regresiones de configuración de la auditoría integral', () => {
  const env = { ...process.env, NODE_ENV:'production', HOST:'0.0.0.0', JWT_SECRET:'x'.repeat(128),JWT_ISSUER:'by-jers-api',JWT_AUDIENCE:'by-jers-store',MONGODB_URI:'mongodb+srv://ficticio:ficticio@cluster.example.com/demo',FRONTEND_URL:'https://example.com',FRONTEND_ALLOWED_ORIGINS:'https://example.com',API_ORIGIN:'https://example.com',SECRETS_FROM_ENV:'true',COOKIE_SECURE:'true',TRUST_PROXY_HOPS:'1',RATE_LIMIT_STORE:'mongodb',REDIS_ENABLED:'false',EMAIL_ENABLED:'false',JEST_WORKER_ID:'' };
  const validate = extra => execFileSync(process.execPath,['--input-type=module','-e',`const m=await import(${JSON.stringify(envPath)});m.validateSecurityEnvironment();console.log('OK');`],{env:{...env,...extra},stdio:'pipe',timeout:10000}).toString().trim();
  test('no admite memoria en producción aunque Redis esté habilitado',()=>{
    expect(()=>validate({RATE_LIMIT_STORE:'memory',REDIS_ENABLED:'true',REDIS_URL:'rediss://example.com:6379'})).toThrow(/RATE_LIMIT_STORE/);
  });
  test.each(['-1','0','abc'])('rechaza límite inválido %s',value=>{
    expect(()=>validate({AUTH_RATE_LIMIT_MAX_REQUESTS:value})).toThrow(/entero positivo/);
  });
  test.each(['tls=false','tlsAllowInvalidCertificates=true','tlsInsecure=true'])('no acepta TLS debilitado en Atlas: %s',option=>{
    expect(()=>validate({MONGODB_URI:env.MONGODB_URI+'?'+option})).toThrow(/MONGODB_URI_TLS/);
  });
  test('limita la sesión administrativa a una hora',()=>{
    expect(()=>validate({ADMIN_SESSION_EXPIRES_IN:'2h'})).toThrow(/ADMIN_SESSION_EXPIRES_IN/);
    expect(validate({ADMIN_SESSION_EXPIRES_IN:'1h'})).toBe('OK');
  });
  test('la cookie CSRF usa Secure, host-only, ocho horas y es legible por el cliente',()=>{
    const security=new URL('../src/middleware/security.js',import.meta.url).href;
    const script=`const {csrfProtection}=await import(${JSON.stringify(security)});let settings;csrfProtection({method:'GET',cookies:{}},{cookie:(name,value,options)=>{settings=options}},()=>{});console.log(JSON.stringify(settings));`;
    const output=execFileSync(process.execPath,['--input-type=module','-e',script],{env,stdio:'pipe',timeout:10000});
    expect(JSON.parse(output.toString())).toEqual({httpOnly:false,secure:true,sameSite:'lax',path:'/',maxAge:28800000});
  });
  test('Sentry configurado no rompe el arranque y el handler se registra correctamente',()=>{
    const appUrl=new URL('../src/app.js',import.meta.url).href;
    const instrument=new URL('../src/instrument.js',import.meta.url).href;
    const script=`await import(${JSON.stringify(appUrl)});const {Sentry}=await import(${JSON.stringify(instrument)});await Sentry.close(20);console.log('OK');`;
    const output=execFileSync(process.execPath,['--input-type=module','-e',script],{env:{...env,SENTRY_DSN:'https://public@example.com/1'},stdio:'pipe',timeout:15000});
    expect(output.toString().trim()).toBe('OK');
  });
});

test('el handler serverless no expone errores de arranque y prohíbe caché',()=>{
  const handlerUrl=new URL('../../api/index.js',import.meta.url).href;
  const script=`const {default:handler}=await import(${JSON.stringify(handlerUrl)});let status,body,headers={};await handler({url:'/api?path=health',query:{path:'health'}},{setHeader:(k,v)=>headers[k]=v,status:s=>{status=s;return {json:b=>{body=b}}}});console.log(JSON.stringify({status,body,headers}));`;
  const output=execFileSync(process.execPath,['--input-type=module','-e',script],{env:{...process.env,NODE_ENV:'production',JWT_SECRET:''},timeout:10000,stdio:'pipe'});
  const result=JSON.parse(output.toString());expect(result.status).toBe(503);expect(result.body.error.code).toBe('API_NOT_CONFIGURED');expect(result.headers['Cache-Control']).toBe('no-store');expect(JSON.stringify(result.body)).not.toMatch(/JWT_SECRET|MONGODB_URI|\/home\/|stack|revisar/);
});
