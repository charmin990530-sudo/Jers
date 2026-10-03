import nodemailer from 'nodemailer';
import {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
  SMTP_PASS,
  EMAIL_FROM,
  NODE_ENV,
  FRONTEND_URL,
} from '../config/env.js';

const escapeHtml = value => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');
const normalizeHeader = value => String(value ?? '').replace(/[\r\n]/g, ' ').trim();

/**
 * Línea de IVA para los correos, en texto plano y en HTML.
 *
 * Devuelve arrays vacíos cuando el pedido no lleva impuestos (por ejemplo, una
 * tasa a 0%), para que quien lo llama pueda hacer `...iva.texto` sin conditionally
 * ensuciar las dos plantillas. La tasa se congela en el pedido (`tasaImpuestosBp`),
 * así que el correo de un pedido antiguo sigue mostrando lo que se cobró entonces
 * aunque la tarifa global haya cambiado.
 */
/**
 * Formatea un importe entero como COP para los correos. Reutiliza el mismo
 * criterio que el resto del sistema (pesos sin centavos, ver services/money.js)
 * en vez de depender de la configuración regional del servidor.
 */
const montoCorreo = valor => `$${Number(valor || 0).toLocaleString('es-CO')}`;

const lineaImpuestos = (impuestos, tasaBp) => {
  const monto = Number(impuestos) || 0;
  if (monto === 0) return { texto: [], html: [] };
  const tasa = Number.isFinite(Number(tasaBp)) ? Number(tasaBp) / 100 : null;
  const etiqueta = tasa === null ? 'IVA' : `IVA (${tasa.toFixed(tasa % 1 === 0 ? 0 : 2)}%)`;
  return {
    texto: [`${etiqueta}: ${montoCorreo(monto)}`],
    html: [`<strong>${escapeHtml(etiqueta)}:</strong> ${montoCorreo(monto)}<br>`],
  };
};

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

/**
 * Avisa a quien YA tiene cuenta de que alguien intentó registrarse con su correo.
 *
 * Es la otra mitad del arreglo de B-02: el endpoint de registro deja de responder
 * distinto según el email exista o no, y para que eso no sea un muro seco, quien
 * tiene la cuenta se entera. Así el titular además puede recuperar la contraseña
 * si de verdad fue un intento suyo del que se olvidó.
 *
 * NO se manda el enlace de restablecimiento: enviarlo convertiría este correo en
 * una vía para tomar cuentas ajenas, ya que cualquiera que sepa el email
 * podría pedirlo. Va el enlace del login, que no da acceso a nada.
 */
export const sendDuplicateRegistrationEmail = ({ to, nombre }) => sendEmail({
  to,
  subject: 'Alguien intentó registrarse con tu correo de By Jers',
  text: [
    `Hola ${nombre},`,
    '',
    'Alguien intentó crear una cuenta en By Jers con este correo, que ya está registrado.',
    'La cuenta no se ha modificado ni se ha creado ninguna nueva.',
    '',
    'Si eras tú y se te olvidó que tenías cuenta, entra con tu contraseña; si no la',
    'recuerdas, puedes restablecerla desde la página de iniciar sesión.',
    `Volver a By Jers: ${FRONTEND_URL}`,
  ].join('\n'),
  html: `
    <p>Hola ${escapeHtml(nombre)},</p>
    <p>Alguien intentó crear una cuenta en <strong>By Jers</strong> con este correo, que ya está registrado.
       La cuenta no se ha modificado ni se ha creado ninguna nueva.</p>
    <p>Si eras tú y se te olvidó que tenías cuenta, entra con tu contraseña; si no la recuerdas,
       puedes restablecerla desde la página de iniciar sesión.</p>
    <p><a href="${escapeHtml(FRONTEND_URL)}">Volver a By Jers</a></p>
  `,
});

export const sendContactEmail = ({ nombre, email, telefono, mensaje }) => sendEmail({
  to: EMAIL_FROM,
  subject: `Nuevo mensaje de contacto de ${normalizeHeader(nombre)}`,
  text: `Nombre: ${nombre}\nEmail: ${email}\nTeléfono: ${telefono}\nMensaje: ${mensaje}`,
  html: `<p><strong>Nombre:</strong> ${escapeHtml(nombre)}</p><p><strong>Email:</strong> ${escapeHtml(email)}</p><p><strong>Teléfono:</strong> ${escapeHtml(telefono)}</p><p>${escapeHtml(mensaje)}</p>`,
});

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
export const construirCorreoConfirmacionPedido = ({ nombre, numeroOrden, items, subtotal, costoEnvio, impuestos, tasaImpuestosBp, total, direccionEnvio, notas }) => {
  const lineas = detalleItems(items);
  const envio = Number(costoEnvio) === 0 ? 'Gratis' : montoCorreo(costoEnvio);
  const iva = lineaImpuestos(impuestos, tasaImpuestosBp);
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
    ...iva.texto,
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
    ...iva.html,
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
export const construirAvisoPedidoNuevo = ({ numeroOrden, cliente, email, telefono, items, subtotal, costoEnvio, impuestos, tasaImpuestosBp, total, direccionEnvio, notas }) => {
  const lineas = detalleItems(items);
  const envio = Number(costoEnvio) === 0 ? 'Gratis' : montoCorreo(costoEnvio);
  const iva = lineaImpuestos(impuestos, tasaImpuestosBp);
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
    ...iva.texto,
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
    ...iva.html,
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
