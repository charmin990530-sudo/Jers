import nodemailer from 'nodemailer';
import {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
  SMTP_PASS,
  EMAIL_FROM,
  NODE_ENV,
} from '../config/env.js';

const escapeHtml = value => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');
const normalizeHeader = value => String(value ?? '').replace(/[\r\n]/g, ' ').trim();

let transporter;

const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      requireTLS: NODE_ENV === 'production',
      auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    });
  }
  return transporter;
};

export const sendEmail = async ({ to, subject, text, html }) => {
  if (!SMTP_HOST) return { sent: false };
  await getTransporter().sendMail({ from: EMAIL_FROM, to, subject, text, html });
  return { sent: true };
};

export const sendPasswordResetEmail = ({ to, resetUrl }) => sendEmail({
  to,
  subject: 'Restablece tu contraseña de By Jers',
  text: `Restablece tu contraseña usando este enlace: ${resetUrl}`,
  html: `<p>Restablece tu contraseña usando este enlace:</p><p><a href="${escapeHtml(resetUrl)}">Restablecer contraseña</a></p>`,
});

export const sendContactEmail = ({ nombre, email, telefono, mensaje }) => sendEmail({
  to: EMAIL_FROM,
  subject: `Nuevo mensaje de contacto de ${normalizeHeader(nombre)}`,
  text: `Nombre: ${nombre}\nEmail: ${email}\nTeléfono: ${telefono}\nMensaje: ${mensaje}`,
  html: `<p><strong>Nombre:</strong> ${escapeHtml(nombre)}</p><p><strong>Email:</strong> ${escapeHtml(email)}</p><p><strong>Teléfono:</strong> ${escapeHtml(telefono)}</p><p>${escapeHtml(mensaje)}</p>`,
});

/**
 * Formatea un importe entero como COP para los correos. Reutiliza el mismo
 * criterio que el resto del sistema (pesos sin centavos, ver services/money.js)
 * en vez de depender de la configuración regional del servidor.
 */
const montoCorreo = valor => `$${Number(valor || 0).toLocaleString('es-CO')}`;

/** Lineas de un item de pedido, en texto plano y en HTML. */
const detalleItems = items => (items || [])
  .map(item => ({ texto: `• ${item.nombre} x${item.cantidad} - ${montoCorreo(item.subtotal)}`, html: `<li>${escapeHtml(item.nombre)} x${item.cantidad} — ${montoCorreo(item.subtotal)}</li>` }));

/**
 * Confirmación de pedido para el cliente.
 *
 * POR QUÉ EXISTE
 * --------------
 * El cobro se cierra por WhatsApp: `createOrder` descuenta el stock, crea el
 * pedido y devuelve una URL de wa.me para que el cliente confirme. Si cierra esa
 * pestaña antes de enviar el mensaje, el pedido queda en estado `pendiente`,
 * con el stock ya descontado, y NADIE se enteraba: no habia ningun aviso a
 * ninguna de las dos partes. Este correo cierra ese hueco, y el aviso al
 * administrador (abajo) es la otra mitad.
 *
 * Los importes se reciben ya calculados y redondeados desde el pedido; no se
 * vuelve a multiplicar nada aqui, para que el correo coincida exactamente con
 * lo que se guardo en la base de datos.
 *
 * @returns {{subject: string, text: string, html: string}} Plantilla pura, sin
 *   dependencias de red: se puede verificar en tests sin SMTP configurado.
 */
export const construirCorreoConfirmacionPedido = ({ nombre, numeroOrden, items, subtotal, costoEnvio, total, direccionEnvio, notas }) => {
  const lineas = detalleItems(items);
  const envio = Number(costoEnvio) === 0 ? 'Gratis' : montoCorreo(costoEnvio);
  const ciudad = [direccionEnvio?.ciudad, direccionEnvio?.departamento].filter(Boolean).join(', ');
  const envioLineas = [
    direccionEnvio?.nombreCompleto || '',
    direccionEnvio?.direccion || '',
    ciudad,
    direccionEnvio?.telefono ? `Tel: ${direccionEnvio.telefono}` : '',
  ].filter(Boolean);

  const text = [
    `Hola ${nombre},`,
    '',
    'Recibimos tu pedido. Te confirmamos los detalles:',
    '',
    ...lineas.map(l => l.texto),
    '',
    `Subtotal: ${montoCorreo(subtotal)}`,
    `Envío: ${envio}`,
    `Total: ${montoCorreo(total)}`,
    '',
    'Datos de envío:',
    ...envioLineas,
    ...(notas ? ['', `Notas: ${notas}`] : []),
    '',
    `Pedido: ${numeroOrden}`,
    '',
    'Te contactaremos para confirmar el pago y el envío.',
  ].join('\n');

  const html = [
    `<p>Hola ${escapeHtml(nombre)},</p>`,
    '<p>Recibimos tu pedido. Te confirmamos los detalles:</p>',
    `<ul>${lineas.map(l => l.html).join('')}</ul>`,
    `<p><strong>Subtotal:</strong> ${montoCorreo(subtotal)}<br>`,
    `<strong>Envío:</strong> ${escapeHtml(envio)}<br>`,
    `<strong>Total:</strong> ${montoCorreo(total)}</p>`,
    '<p><strong>Datos de envío:</strong><br>',
    envioLineas.map(l => escapeHtml(l)).join('<br>'),
    '</p>',
    ...(notas ? [`<p><strong>Notas:</strong> ${escapeHtml(notas)}</p>`] : []),
    `<p><strong>Pedido:</strong> ${escapeHtml(numeroOrden)}</p>`,
    '<p>Te contactaremos para confirmar el pago y el envío.</p>',
  ].join('');

  return { subject: `Pedido ${numeroOrden} recibido | By Jers`, text, html };
};

/**
 * Aviso interno de pedido nuevo, dirigido a la casilla del negocio (EMAIL_FROM,
 * igual que el aviso de contacto).
 *
 * Complementa al correo al cliente: si el cliente abandona el chat de WhatsApp,
 * quien tiene que enterarse del pedido es la tienda, no él. Sin esto, la única
 * señal de una venta era que alguien mirara el panel de administración.
 */
export const construirAvisoPedidoNuevo = ({ numeroOrden, cliente, email, telefono, items, subtotal, costoEnvio, total, direccionEnvio, notas }) => {
  const lineas = detalleItems(items);
  const envio = Number(costoEnvio) === 0 ? 'Gratis' : montoCorreo(costoEnvio);
  const ciudad = [direccionEnvio?.ciudad, direccionEnvio?.departamento].filter(Boolean).join(', ');

  const text = [
    `Nuevo pedido: ${numeroOrden}`,
    '',
    `Cliente: ${cliente || ''}`,
    `Email: ${email || ''}`,
    `Teléfono: ${telefono || ''}`,
    '',
    ...lineas.map(l => l.texto),
    '',
    `Subtotal: ${montoCorreo(subtotal)}`,
    `Envío: ${envio}`,
    `Total: ${montoCorreo(total)}`,
    '',
    'Enviar a:',
    [direccionEnvio?.nombreCompleto, direccionEnvio?.direccion, ciudad].filter(Boolean).join('\n'),
    ...(notas ? ['', `Notas: ${notas}`] : []),
  ].join('\n');

  const html = [
    `<p><strong>Nuevo pedido: ${escapeHtml(numeroOrden)}</strong></p>`,
    `<p><strong>Cliente:</strong> ${escapeHtml(cliente || '')}<br>`,
    `<strong>Email:</strong> ${escapeHtml(email || '')}<br>`,
    `<strong>Teléfono:</strong> ${escapeHtml(telefono || '')}</p>`,
    `<ul>${lineas.map(l => l.html).join('')}</ul>`,
    `<p><strong>Subtotal:</strong> ${montoCorreo(subtotal)}<br>`,
    `<strong>Envío:</strong> ${escapeHtml(envio)}<br>`,
    `<strong>Total:</strong> ${montoCorreo(total)}</p>`,
    '<p><strong>Enviar a:</strong><br>',
    [direccionEnvio?.nombreCompleto, direccionEnvio?.direccion, ciudad].filter(Boolean).map(l => escapeHtml(l)).join('<br>'),
    '</p>',
    ...(notas ? [`<p><strong>Notas:</strong> ${escapeHtml(notas)}</p>`] : []),
  ].join('');

  return { subject: `Nuevo pedido ${numeroOrden} — ${montoCorreo(total)}`, text, html };
};

export const sendOrderConfirmationEmail = datos => {
  const plantilla = construirCorreoConfirmacionPedido(datos);
  return sendEmail({ ...plantilla, to: datos.to });
};

export const sendNewOrderNotificationEmail = datos => {
  const plantilla = construirAvisoPedidoNuevo(datos);
  return sendEmail({ ...plantilla, to: EMAIL_FROM });
};
