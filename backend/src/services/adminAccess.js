/** Aprovisionamiento administrativo por CLI; nunca es una ruta HTTP. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import User from '../models/User.js';

export class AdminAccessError extends Error {}
const fail = message => { throw new AdminAccessError(message); };

export async function provisionAdmin({ email, accessFile, origin, rotateExisting = false }) {
  const parsed = z.string().trim().toLowerCase().email().max(254).safeParse(email);
  if (!parsed.success) fail('Indica un email administrativo válido.');
  email = parsed.data;
  let url;
  try { url = new URL(origin); } catch { fail('El origen de la tienda no es válido.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') fail('Usa un origen HTTP(S) sin ruta ni credenciales.');
  if (!accessFile || !path.basename(accessFile).startsWith('.env.')) fail('El archivo privado debe llamarse .env.algo.json.');
  let user = await User.findOne({ email }).select('+password');
  if (user && (user.role !== 'admin' || !user.activo)) fail('La cuenta existente no es un administrador activo; no se modifica.');
  if (fs.existsSync(accessFile)) {
    const stat = fs.lstatSync(accessFile);
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077)) fail('El archivo existente debe ser regular y privado (0600).');
    let saved;
    try { saved = JSON.parse(fs.readFileSync(accessFile, 'utf8')); } catch { fail('No se pudo leer el archivo privado de acceso.'); }
    if (saved.email !== email || typeof saved.password !== 'string' || !user || !await user.compararPassword(saved.password)) fail('El archivo no corresponde al acceso vigente; usa otro archivo para una rotación deliberada.');
    return { email, accessFile, action: 'verified', dashboard: `${url.origin}/admin` };
  }
  if (user && !rotateExisting) fail('La cuenta ya existe: requiere --rotate-existing para renovar su contraseña y revocar sesiones.');
  const password = crypto.randomBytes(24).toString('base64url');
  const credentials = { email, password, login: `${url.origin}/login?redirect=%2Fadmin`, dashboard: `${url.origin}/admin`, createdAt: new Date().toISOString(), scope: 'Acceso únicamente a la base configurada al ejecutar este comando. No compartir ni versionar.' };
  // Persistir primero el secreto: un error de permisos no debe bloquear la cuenta.
  const fd = fs.openSync(accessFile, 'wx', 0o600);
  const action = user ? 'rotated' : 'created';
  try {
    try { fs.writeFileSync(fd, JSON.stringify(credentials, null, 2) + '\n'); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    if (user) {
      const result = await User.updateOne(
        { _id: user._id, role: 'admin', activo: true, password: user.password, tokenVersion: user.tokenVersion },
        { $set: { password: await bcrypt.hash(password, 12) }, $inc: { tokenVersion: 1 }, $unset: { resetPasswordToken: 1, resetPasswordExpires: 1 } },
      );
      if (result.modifiedCount !== 1) fail('La cuenta cambió durante la operación; no se sobrescribió su acceso.');
    } else {
      user = await User.create({ email, password, nombre: 'Administrador', apellido: 'By Jers', role: 'admin', activo: true });
    }
  } catch (error) { fs.unlinkSync(accessFile); throw error; }
  return { email, accessFile, action, dashboard: `${url.origin}/admin` };
}
