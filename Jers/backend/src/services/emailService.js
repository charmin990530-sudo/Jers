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
