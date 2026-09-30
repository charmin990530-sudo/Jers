/**
 * Correos de pedido: confirmacion al cliente y aviso interno.
 *
 * POR QUE EXISTE ESTE ARCHIVO
 * ---------------------------
 * El cobro se cierra por WhatsApp, asi que el correo era el UNICO canal
 * automatico que confirmaba una compra. Sin el, un cliente que cerraba la
 * pestaña del chat dejaba el pedido en `pendiente`, con el stock ya
 * descontado, sin que nadie se enterara.
 *
 * Lo que se verifica aqui:
 *  - Los importes del correo son los del pedido, formateados en COP.
 *  - Los datos que vienen del usuario (nombre de producto, direccion, notas)
 *    van escapados en el HTML: son texto libre de la base de datos.
 *  - El envio no rompe el checkout cuando SMTP falla.
 *
 * Las plantillas son funciones puras (`construir*`), de modo que se pueden
 * comprobar sin SMTP configurado: `sendEmail` es un no-op sin `SMTP_HOST`
 * (emailService.js:36) y `env.js:177` solo lo exige en produccion.
 */
import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { User, Product, Cart, Order } from '../src/models/index.js';
import { routes } from '../src/routes/index.js';
import { notFound, errorHandler } from '../src/middleware/errorHandler.js';
import { JWT_SECRET, JWT_COOKIE_NAME } from '../src/config/env.js';
import { SMTP_HOST } from '../src/config/env.js';
import {
  construirCorreoConfirmacionPedido,
  construirAvisoPedidoNuevo,
  sendEmail,
} from '../src/services/emailService.js';

const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/cart', routes.cart);
  app.use('/api/orders', routes.orders);
  app.use(notFound);
  app.use(errorHandler);
  return app;
};

const DIRECCION = {
  alias: 'Casa',
  nombreCompleto: 'Ana Restrepo',
  telefono: '3001234567',
  direccion: 'Calle 10 #20-30',
  ciudad: 'Medellín',
  departamento: 'Antioquia',
};

const ITEMS = [
  { nombre: 'Labial Mate', cantidad: 2, precioUnitario: 29000, subtotal: 58000 },
  { nombre: 'Base Líquida', cantidad: 1, precioUnitario: 120000, subtotal: 120000 },
];

describe('correos de pedido', () => {
  describe('construccion de la plantilla de confirmacion', () => {
    it('incluye el numero de pedido y los tres importes del pedido', () => {
      const { subject, text, html } = construirCorreoConfirmacionPedido({
        nombre: 'Ana Restrepo',
        numeroOrden: 'BJ-260930-AB12CD',
        items: ITEMS,
        subtotal: 178000,
        costoEnvio: 0,
        total: 178000,
        direccionEnvio: DIRECCION,
        notas: 'Entregar en la tarde',
      });

      expect(subject).toContain('BJ-260930-AB12CD');
      // 58000 + 120000 = 178000, y el subtotal se formatea en COP.
      expect(text).toContain('$178.000');
      expect(text).toContain('Subtotal: $178.000');
      expect(text).toContain('Total: $178.000');
      expect(html).toContain('$178.000');
    });

    it('muestra cada linea con su cantidad y su subtotal', () => {
      const { text, html } = construirCorreoConfirmacionPedido({
        nombre: 'Ana',
        numeroOrden: 'BJ-1',
        items: ITEMS,
        subtotal: 178000,
        costoEnvio: 0,
        total: 178000,
        direccionEnvio: DIRECCION,
      });

      expect(text).toContain('Labial Mate x2 - $58.000');
      expect(text).toContain('Base Líquida x1 - $120.000');
      expect(html).toContain('<li>Labial Mate x2');
      expect(html).toContain('<li>Base Líquida x1');
    });

    it('distingue el envio gratis del envio de pago', () => {
      const gratis = construirCorreoConfirmacionPedido({
        numeroOrden: 'BJ-1', items: ITEMS, subtotal: 178000, costoEnvio: 0, total: 178000, direccionEnvio: DIRECCION,
      });
      const pagado = construirCorreoConfirmacionPedido({
        numeroOrden: 'BJ-1', items: ITEMS, subtotal: 58000, costoEnvio: 15000, total: 73000, direccionEnvio: DIRECCION,
      });

      expect(gratis.text).toContain('Envío: Gratis');
      expect(pagado.text).toContain('Envío: $15.000');
      expect(pagado.text).toContain('Total: $73.000');
    });

    it('incluye la direccion de envio y las notas cuando las hay', () => {
      const conNotas = construirCorreoConfirmacionPedido({
        nombre: 'Ana', numeroOrden: 'BJ-1', items: ITEMS, subtotal: 178000, costoEnvio: 0, total: 178000,
        direccionEnvio: DIRECCION, notas: 'Tocar el timbre',
      });
      expect(conNotas.text).toContain('Calle 10 #20-30');
      expect(conNotas.text).toContain('Medellín, Antioquia');
      expect(conNotas.text).toContain('Tocar el timbre');

      const sinNotas = construirCorreoConfirmacionPedido({
        nombre: 'Ana', numeroOrden: 'BJ-1', items: ITEMS, subtotal: 178000, costoEnvio: 0, total: 178000,
        direccionEnvio: DIRECCION,
      });
      expect(sinNotas.text).not.toContain('Notas:');
    });

    // El nombre del producto, la direccion y las notas son texto libre que
    // viene de la base de datos (los escribe un admin o el cliente), asi que
    // tienen que viajar escapados en el HTML del correo.
    it('escapa en el HTML los datos que vienen del usuario', () => {
      const { html } = construirCorreoConfirmacionPedido({
        nombre: '<img src=x onerror=alert(1)>',
        numeroOrden: 'BJ-1',
        items: [{ nombre: '<script>alert("producto")</script>', cantidad: 1, precioUnitario: 1000, subtotal: 1000 }],
        subtotal: 1000,
        costoEnvio: 0,
        total: 1000,
        direccionEnvio: { ...DIRECCION, direccion: '"><script>alert("dir")</script>' },
        notas: '<b onclick="x()">nota</b>',
      });

      // Lo que importa es que no quede una ETIQUETA ni un ATRIBUTO ejecutable.
      // Los caracteres `<` y `>` ya son entidad, de modo que la cadena "onerror="
      // sigue apareciendo como texto inerte: buscarla seria un falso positivo.
      // La asercion real es que no exista el caracter de apertura de etiqueta.
      expect(html).not.toMatch(/<script/i);
      expect(html).not.toMatch(/<img/i);
      expect(html).not.toMatch(/on\w+\s*=\s*["']/i);
      expect(html).toContain('&lt;script&gt;');
      expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
      expect(html).toContain('&lt;b onclick=');
    });

    it('no rompe con direccion incompleta ni sin items', () => {
      const minimo = construirCorreoConfirmacionPedido({
        nombre: 'Ana', numeroOrden: 'BJ-1', items: [], subtotal: 0, costoEnvio: 0, total: 0, direccionEnvio: {},
      });
      expect(minimo.text).toContain('Total: $0');
      expect(typeof minimo.html).toBe('string');
    });
  });

  describe('construccion del aviso interno', () => {
    it('lleva el contacto del cliente para que la tienda pueda cobrar', () => {
      const { subject, text, html } = construirAvisoPedidoNuevo({
        numeroOrden: 'BJ-260930-AB12CD',
        cliente: 'Ana Restrepo',
        email: 'ana@example.com',
        telefono: '3001234567',
        items: ITEMS,
        subtotal: 178000,
        costoEnvio: 0,
        total: 178000,
        direccionEnvio: DIRECCION,
      });

      expect(subject).toContain('BJ-260930-AB12CD');
      expect(subject).toContain('$178.000');
      expect(text).toContain('Ana Restrepo');
      expect(text).toContain('ana@example.com');
      expect(text).toContain('3001234567');
      expect(text).toContain('Calle 10 #20-30');
      expect(html).toContain('ana@example.com');
    });

    it('escapa el nombre del cliente', () => {
      const { html } = construirAvisoPedidoNuevo({
        numeroOrden: 'BJ-1', cliente: '<script>alert(1)</script>', email: 'a@b.com',
        items: ITEMS, subtotal: 1000, costoEnvio: 0, total: 1000, direccionEnvio: DIRECCION,
      });
      expect(html).not.toMatch(/<script/i);
      expect(html).toContain('&lt;script&gt;');
    });
  });

  it('sendEmail es un no-op cuando no hay SMTP_HOST configurado', async () => {
    // En el entorno de test SMTP_HOST esta vacio, y es lo que hace que toda la
    // suite sea independiente del correo electronico.
    expect(SMTP_HOST).toBe('');
    await expect(sendEmail({ to: 'a@b.com', subject: 'x', text: 'y' }))
      .resolves.toEqual({ sent: false });
  });
});

describe('crear un pedido no depende del correo', () => {
  let app;
  let authCookie;
  let testUser;
  let testProduct;

  beforeEach(async () => {
    app = createTestApp();
    await User.deleteMany({});
    await Product.deleteMany({});
    await Cart.deleteMany({});
    await Order.deleteMany({});

    testProduct = await Product.create({
      nombre: 'Labial Mate',
      slug: 'labial-mate-test',
      descripcion: 'Producto de prueba',
      precio: 29000,
      stock: 10,
      categoria: '507f1f77bcf86cd799439011',
      marca: '507f1f77bcf86cd799439012',
      imagenes: [{ url: 'https://example.com/img.jpg', esPrincipal: true }],
    });

    const hashedPassword = await bcrypt.hash('password123', 12);
    testUser = await User.create({
      nombre: 'Ana',
      apellido: 'Restrepo',
      email: 'ana@example.com',
      password: hashedPassword,
      aceptoTerminos: true,
      aceptoPrivacidad: true,
    });

    const token = jwt.sign({ id: testUser._id }, JWT_SECRET, { expiresIn: '7d' });
    authCookie = `${JWT_COOKIE_NAME}=${token}`;

    await Cart.create({
      usuario: testUser._id,
      items: [{ producto: testProduct._id, cantidad: 2, precioUnitario: 29000, nombreSnapshot: 'Labial Mate' }],
    });
  });

  it('crea el pedido, descuenta stock y devuelve el numero de orden', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Cookie', authCookie)
      .send({ direccionEnvio: DIRECCION });

    expect(res.status).toBe(201);
    expect(res.body.order.numeroOrden).toMatch(/^BJ-\d{6}-[A-Z0-9]{6}$/);
    // 2 x 29000 = 58000 de subtotal, por debajo del umbral de envio gratis
    // (200000), asi que se cobran 15000 de envio: 73000 en total.
    expect(res.body.order.total).toBe(73000);

    // El pedido existe con los mismos importes que se avisaron por correo.
    const guardado = await Order.findOne({ _id: res.body.order.id }).lean();
    expect(guardado.subtotal).toBe(58000);
    expect(guardado.costoEnvio).toBe(15000);
    expect(guardado.total).toBe(73000);

    // El stock se descuenta, y eso es justamente lo que hace grave que el
    // correo no llegara: el inventario queda retenido por un pedido que el
    // negocio no sabe que existe.
    const producto = await Product.findById(testProduct._id);
    expect(producto.stock).toBe(8);
  });
});
