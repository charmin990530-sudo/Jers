import { describe, it, expect, jest } from '@jest/globals';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { routes } from '../src/routes/index.js';
import { User, Order, Cart, Product, Contact, DataRequest } from '../src/models/index.js';
import { JWT_SECRET, JWT_COOKIE_NAME } from '../src/config/env.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { schemas } from '../src/middleware/validation.js';
import { sanitizeTelemetryEvent } from '../src/utils/privacy.js';

const app = express();
app.use(express.json()); app.use(cookieParser());
for (const [path, router] of Object.entries(routes)) app.use('/api/' + path, router);
app.use(errorHandler);
const password = 'ClaveFicticia2026!';
const createUser = (email, extra = {}) => User.create({nombre:'Persona',apellido:'Ficticia',email,password,aceptoTerminos:true,aceptoPrivacidad:true,...extra});
const cookie = (user, expiresIn = '1h') => `${JWT_COOKIE_NAME}=${jwt.sign({id:user._id,ver:user.tokenVersion},JWT_SECRET,{expiresIn})}`;
const address = {alias:'Casa ficticia',nombreCompleto:'Persona Ficticia',telefono:'3000000000',direccion:'Calle ficticia 123',ciudad:'Bogotá',departamento:'Cundinamarca'};
const product = () => Product.create({nombre:'Producto ficticio',descripcion:'Descripción de producto ficticio',precio:1000,stock:5,categoria:'507f1f77bcf86cd799439011',marca:'507f1f77bcf86cd799439012',imagenes:[{url:'/img/logo/logo.webp'}]});

describe('Auditoría integral: regresiones de seguridad y privacidad', () => {
  it('rechaza contraseñas que bcrypt truncaría, también Unicode', () => {
    const base={nombre:'Persona',apellido:'Prueba',email:'persona@example.com',aceptoTerminos:true,aceptoPrivacidad:true};
    expect(schemas.register.safeParse({...base,password:'a'.repeat(72)}).success).toBe(true);
    expect(schemas.register.safeParse({...base,password:'a'.repeat(73)}).success).toBe(false);
    expect(schemas.register.safeParse({...base,password:'🔒'.repeat(19)}).success).toBe(false);
    expect(schemas.login.safeParse({email:base.email,password:'x'.repeat(100000)}).success).toBe(false);
  });

  it('compara bcrypt y responde igual ante cuenta ausente, inactiva o clave errónea', async () => {
    const active=await createUser('activa@example.com');
    await createUser('inactiva@example.com',{activo:false});
    const compare=jest.spyOn(bcrypt,'compare');
    try {
      const results=[];
      for(const email of ['ausente@example.com',active.email,'inactiva@example.com']) {
        compare.mockClear();
        const response=await request(app).post('/api/auth/login').send({email,password:'Incorrecta123'}).expect(401);
        expect(compare).toHaveBeenCalledTimes(1);results.push(response.body.error);
      }
      expect(results[0]).toEqual(results[1]);expect(results[1]).toEqual(results[2]);
    } finally { compare.mockRestore(); }
  });

  it('mantiene neutro el registro concurrente y no permite asignar roles', async () => {
    const payload={nombre:'Persona',apellido:'Prueba',email:'race@example.com',password,aceptoTerminos:true,aceptoPrivacidad:true,role:'admin'};
    const responses=await Promise.all([request(app).post('/api/auth/register').send(payload),request(app).post('/api/auth/register').send(payload)]);
    expect(responses.map(r=>r.status)).toEqual([201,201]);
    expect(responses[0].body).toEqual(responses[1].body);
    expect((await User.findOne({email:payload.email})).role).toBe('user');
    expect(await User.countDocuments({email:payload.email})).toBe(1);
  });

  it('un token antiguo sin versión no deja colgada la autenticación opcional', () => {
    const authUrl=new URL('../src/middleware/auth.js',import.meta.url).href;
    const jwtUrl=new URL('../../node_modules/jsonwebtoken/index.js',import.meta.url).href;
    const script=`const {optionalAuth}=await import(${JSON.stringify(authUrl)});const {default:jwt}=await import(${JSON.stringify(jwtUrl)});let calls=0;await optionalAuth({cookies:{token:jwt.sign({id:'507f1f77bcf86cd799439011'},process.env.JWT_SECRET)}},{},()=>calls++);if(calls!==1)process.exit(1);console.log('OK');`;
    const output=execFileSync(process.execPath,['--input-type=module','-e',script],{env:{...process.env,NODE_ENV:'development',JWT_SECRET:'x'.repeat(64),JWT_COOKIE_NAME:'token'},timeout:10000,stdio:'pipe'});
    expect(output.toString().trim()).toBe('OK');
  });

  it('deniega sesión ausente o vencida y las rutas administrativas a clientes', async () => {
    const user=await createUser('cliente@example.com');
    await request(app).get('/api/auth/me').expect(401);
    await request(app).get('/api/auth/me').set('Cookie',cookie(user,'-1s')).expect(401);
    for(const path of ['/api/users','/api/admin/productos','/api/admin/contactos','/api/admin/solicitudes-datos']) await request(app).get(path).set('Cookie',cookie(user)).expect(403);
  });

  it('no permite acceder ni modificar pedidos, direcciones o carrito ajenos', async () => {
    const a=await createUser('a@example.com',{direcciones:[address]}),b=await createUser('b@example.com');
    const p=await product();
    const order=await Order.create({usuario:a._id,items:[],subtotal:0,total:0,direccionEnvio:address});
    const cart=await Cart.create({usuario:a._id,items:[{producto:p._id,cantidad:1,precioUnitario:1000,nombreSnapshot:p.nombre}]});
    const c=cookie(b);
    await request(app).get('/api/orders/'+order._id).set('Cookie',c).expect(404);
    await request(app).patch('/api/orders/'+order._id+'/cancelar').set('Cookie',c).send({}).expect(404);
    await request(app).patch('/api/cart/'+cart.items[0]._id).set('Cookie',c).send({cantidad:2}).expect(404);
    await request(app).delete('/api/auth/addresses/'+a.direcciones[0]._id).set('Cookie',c).expect(404);
    expect((await Order.findById(order._id)).estado).toBe('pendiente');expect((await Cart.findById(cart._id)).items[0].cantidad).toBe(1);
  });

  it('la exportación requiere contraseña y contiene solo los datos propios, sin secretos', async () => {
    const a=await createUser('propia@example.com'),b=await createUser('ajena@example.com');
    await Order.create({usuario:b._id,items:[],subtotal:0,total:0,direccionEnvio:address});
    const c=cookie(a);
    await request(app).post('/api/auth/data-export').set('Cookie',c).send({currentPassword:'incorrecta'}).expect(403);
    await request(app).post('/api/auth/data-export').set('Cookie',c).send({currentPassword:password,userId:b._id}).expect(400);
    const response=await request(app).post('/api/auth/data-export').set('Cookie',c).send({currentPassword:password}).expect(200);
    expect(response.headers['cache-control']).toBe('no-store');expect(response.headers['content-disposition']).toContain('attachment');
    expect(response.body.export.perfil.email).toBe(a.email);expect(response.body.export.pedidos).toHaveLength(0);
    expect(JSON.stringify(response.body)).not.toMatch(/ajena@example.com|tokenVersion|resetPasswordToken|\$2[aby]\$|ClaveFicticia/);
  });

  it('registra solicitudes propias sin borrar datos y permite respuesta solo al administrador', async () => {
    const user=await createUser('solicitud@example.com'),admin=await createUser('admin@example.com',{role:'admin'});
    const c=cookie(user),body={currentPassword:password,tipo:'supresion',mensaje:'Quiero revisar mis datos.'};
    const created=await request(app).post('/api/auth/data-requests').set('Cookie',c).send(body).expect(202);
    await request(app).post('/api/auth/data-requests').set('Cookie',c).send(body).expect(202);
    expect(await DataRequest.countDocuments()).toBe(1);expect((await User.findById(user._id)).activo).toBe(true);
    const path='/api/admin/solicitudes-datos/'+created.body.request.id;
    await request(app).patch(path).set('Cookie',c).send({respuesta:'Respuesta ficticia documentada.'}).expect(403);
    await request(app).patch(path).set('Cookie',cookie(admin)).send({respuesta:'Respuesta ficticia documentada.'}).expect(200);
    const own=await request(app).get('/api/auth/data-requests').set('Cookie',c).expect(200);
    expect(own.body.requests[0].estado).toBe('resuelta');
    const other=await request(app).get('/api/auth/data-requests').set('Cookie',cookie(admin)).expect(200);expect(other.body.requests).toEqual([]);
  });

  it('reactivar una cuenta no reactiva las sesiones antiguas', async () => {
    const user=await createUser('reactivar@example.com'),admin=await createUser('administrar@example.com',{role:'admin'});
    const old=cookie(user),adminCookie=cookie(admin),path='/api/users/'+user._id+'/toggle-active';
    await request(app).patch(path).set('Cookie',adminCookie).send({activo:false}).expect(200);
    await request(app).patch(path).set('Cookie',adminCookie).send({activo:true}).expect(200);
    await request(app).get('/api/auth/me').set('Cookie',old).expect(401);
    await request(app).post('/api/auth/login').send({email:user.email,password}).expect(200);
  });

  it('cambiar un rol invalida los tokens ya emitidos', async () => {
    const user=await createUser('rol@example.com'),admin=await createUser('roles-admin@example.com',{role:'admin'});
    await request(app).patch('/api/users/'+user._id+'/role').set('Cookie',cookie(admin)).send({role:'admin'}).expect(200);
    await request(app).get('/api/admin/productos').set('Cookie',cookie(user)).expect(401);
  });

  it('el token de recuperación vence y solo puede consumirse una vez, incluso concurrentemente', async () => {
    const user=await createUser('reset-qa@example.com'),token=crypto.randomBytes(32).toString('hex');
    const hash=crypto.createHash('sha256').update(token).digest('hex');
    await User.updateOne({_id:user._id},{$set:{resetPasswordToken:hash,resetPasswordExpires:new Date(Date.now()-1)}});
    const body={token,password:'OtraFicticia2026!',confirmPassword:'OtraFicticia2026!'};
    await request(app).post('/api/auth/reset-password').send(body).expect(400);
    await User.updateOne({_id:user._id},{$set:{resetPasswordExpires:new Date(Date.now()+60000)}});
    const results=await Promise.all([request(app).post('/api/auth/reset-password').send(body),request(app).post('/api/auth/reset-password').send(body)]);
    expect(results.map(r=>r.status).sort()).toEqual([200,400]);
    await request(app).post('/api/auth/reset-password').send(body).expect(400);
    await request(app).get('/api/auth/me').set('Cookie',cookie(user)).expect(401);
  });

  it('el contacto exige autorización y conserva evidencia sin admitir campos privilegiados', async () => {
    const body={nombre:'Persona Prueba',email:'contacto@example.com',mensaje:'Consulta completamente ficticia.'};
    await request(app).post('/api/contact').send(body).expect(400);
    await request(app).post('/api/contact').send({...body,consentimiento:true,estado:'atendido'}).expect(201);
    const item=await Contact.findOne();expect(item.consentimiento).toBe(true);expect(item.fechaConsentimiento).toBeInstanceOf(Date);expect(item.estado).toBe('nuevo');
  });

  it('rechaza operadores NoSQL y no permite asignar campos de privilegio en el perfil', async () => {
    await request(app).post('/api/auth/login').send({email:{$ne:null},password:{$ne:null}}).expect(400);
    const user=await createUser('mass@example.com');
    await request(app).patch('/api/auth/profile').set('Cookie',cookie(user)).send({nombre:'Actualizado',role:'admin',activo:false,tokenVersion:999}).expect(200);
    const updated=await User.findById(user._id);expect(updated.role).toBe('user');expect(updated.activo).toBe(true);expect(updated.tokenVersion).toBe(0);
  });

  it('el enlace de WhatsApp no contiene nombre, domicilio, teléfono, notas ni productos', async () => {
    const user=await createUser('pedido-privado@example.com'),p=await product();
    await Cart.create({usuario:user._id,items:[{producto:p._id,cantidad:1,precioUnitario:1000,nombreSnapshot:p.nombre}]});
    const r=await request(app).post('/api/orders').set('Cookie',cookie(user)).send({direccionEnvio:address,notas:'Nota personal ficticia'}).expect(201);
    const text=new URL(r.body.order.whatsappUrl).searchParams.get('text');expect(text).toContain(r.body.order.numeroOrden);
    for(const value of [address.nombreCompleto,address.telefono,address.direccion,'Nota personal ficticia',p.nombre])expect(text).not.toContain(value);
  });

  it('Sentry conserva diagnóstico de pila sin datos personales ni variables capturadas', () => {
    const event={event_id:'ficticio',request:{url:'https://example.com/?token=no-publicar',data:{password}},user:{email:'privado@example.com'},extra:{password},breadcrumbs:[{data:{email:'privado@example.com'}}],spans:[{description:password}],exception:{values:[{type:'Error',value:password,stacktrace:{frames:[{filename:'app.js?token=no-publicar',lineno:2,function:'checkout',vars:{password}}]}}]}};
    const safe=sanitizeTelemetryEvent(event),text=JSON.stringify(safe);
    expect(text).not.toMatch(/no-publicar|privado@example.com|ClaveFicticia/);expect(safe.exception.values[0].stacktrace.frames[0].function).toBe('checkout');
  });
});

describe('Administración concurrente y sesiones privilegiadas',()=>{
  it('no deja el sistema sin administradores con dos cambios concurrentes',async()=>{
    const a=await createUser('a-admin@example.com',{role:'admin'}),b=await createUser('b-admin@example.com',{role:'admin'});
    const responses=await Promise.all([request(app).patch('/api/users/'+a._id+'/role').set('Cookie',cookie(a)).send({role:'user'}),request(app).patch('/api/users/'+b._id+'/role').set('Cookie',cookie(b)).send({role:'user'})]);
    expect(responses.map(r=>r.status).sort()).toEqual([200,400]);expect(await User.countDocuments({role:'admin',activo:true})).toBe(1);
  });
  it('no da una cookie larga a un administrador aunque solicite recordarme',async()=>{
    const admin=await createUser('sesion-admin@example.com',{role:'admin'});
    const response=await request(app).post('/api/auth/login').send({email:admin.email,password,rememberMe:true}).expect(200);
    expect(response.headers['set-cookie'][0]).toMatch(/Max-Age=3600/);
  });
});

test('el límite por cuenta se aplica aunque cambie la IP del cliente',async()=>{
  const appUrl=new URL('../src/app.js',import.meta.url).href;
  const script=`import request from 'supertest';import mongoose from 'mongoose';await mongoose.connect(process.env.MONGODB_URI,{dbName:'account-limiter-ficticio'});const {app}=await import(${JSON.stringify(appUrl)});const statuses=[];for(let i=0;i<3;i++){const agent=request.agent(app),ip='192.0.2.'+(i+1);const csrf=await agent.get('/api/auth/csrf').set('X-Forwarded-For',ip);const response=await agent.post('/api/auth/login').set('X-Forwarded-For',ip).set('X-CSRF-Token',csrf.body.csrfToken).send({email:'ausente@example.com',password:'Ficticia-invalida'});statuses.push(response.status);}await mongoose.connection.dropDatabase();await mongoose.disconnect();console.log(JSON.stringify(statuses));`;
  const {default:mongoose}=await import('mongoose');
  // Mantener activo el event loop del proceso que hospeda la base temporal.
  // execFileSync impedía progresar a sus operaciones/monitores mientras esperaba al hijo.
  const {stdout}=await promisify(execFile)(process.execPath,['--input-type=module','-e',script],{env:{...process.env,NODE_ENV:'test',MONGODB_URI:mongoose.connection.getClient().s.url,JWT_SECRET:'x'.repeat(64),RATE_LIMIT_STORE:'memory',COOKIE_SECURE:'false',TRUST_PROXY_HOPS:'1',AUTH_RATE_LIMIT_MAX_REQUESTS:'2',RATE_LIMIT_MAX_REQUESTS:'10000',EMAIL_ENABLED:'false'},timeout:20000});
  const lines=stdout.trim().split('\n');expect(JSON.parse(lines.at(-1))).toEqual([401,401,429]);
},25000);
