import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import User from '../src/models/User.js';
import { provisionAdmin } from '../src/services/adminAccess.js';
let directory;
beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jers-admin-test-')); });
afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));
const options = () => ({ email: 'panel@example.com', accessFile: path.join(directory, '.env.admin.json'), origin: 'https://tienda.example.com' });

describe('Acceso del administrador por CLI', () => {
  it('crea un hash y un archivo privado, y reutiliza el acceso sin rotarlo', async () => {
    const o = options();
    expect((await provisionAdmin(o)).action).toBe('created');
    const saved = JSON.parse(fs.readFileSync(o.accessFile));
    const user = await User.findOne({ email: o.email }).select('+password');
    expect(user.role).toBe('admin');
    expect(user.password).not.toBe(saved.password);
    expect(await user.compararPassword(saved.password)).toBe(true);
    expect(fs.statSync(o.accessFile).mode & 0o077).toBe(0);
    expect(user.fechaAceptacionPrivacidad).toBeUndefined();
    expect((await provisionAdmin(o)).action).toBe('verified');
    expect((await User.findById(user.id)).tokenVersion).toBe(0);
  });
  it('exige rotación explícita, revoca sesiones y anula recuperaciones anteriores', async () => {
    const o = options();
    const user = await User.create({ email: o.email, password: 'AnteriorFicticia123!', nombre: 'Admin', apellido: 'Prueba', role: 'admin', tokenVersion: 3, resetPasswordToken: 'hash-viejo', resetPasswordExpires: new Date(Date.now() + 10000) });
    await expect(provisionAdmin(o)).rejects.toThrow('--rotate-existing');
    expect(fs.existsSync(o.accessFile)).toBe(false);
    await provisionAdmin({ ...o, rotateExisting: true });
    const updated = await User.findById(user.id).select('+password +resetPasswordToken');
    expect(updated.tokenVersion).toBe(4);
    expect(await updated.compararPassword('AnteriorFicticia123!')).toBe(false);
    expect(updated.resetPasswordToken).toBeUndefined();
  });
  it('no asciende clientes ni reactiva cuentas inactivas', async () => {
    const o = options();
    const user = await User.create({ email: o.email, password: 'Ficticia123!', nombre: 'Cliente', apellido: 'Prueba' });
    await expect(provisionAdmin({ ...o, rotateExisting: true })).rejects.toThrow('no es un administrador activo');
    await User.updateOne({ _id: user.id }, { role: 'admin', activo: false });
    await expect(provisionAdmin({ ...o, rotateExisting: true })).rejects.toThrow('no es un administrador activo');
    expect(fs.existsSync(o.accessFile)).toBe(false);
  });
  it('un fallo al guardar el archivo no cambia la contraseña ni las sesiones', async () => {
    const o = options();
    const user = await User.create({ email: o.email, password: 'Ficticia123!', nombre: 'Admin', apellido: 'Prueba', role: 'admin' });
    await expect(provisionAdmin({ ...o, accessFile: path.join(directory, 'ausente', '.env.admin.json'), rotateExisting: true })).rejects.toThrow();
    const unchanged = await User.findById(user.id).select('+password');
    expect(await unchanged.compararPassword('Ficticia123!')).toBe(true);
    expect(unchanged.tokenVersion).toBe(0);
  });
});
