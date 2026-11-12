/** Crea o rota un admin sin seed ni contraseñas en argumentos o logs. */
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { AdminAccessError, provisionAdmin } from '../backend/src/services/adminAccess.js';

const root = fileURLToPath(new URL('../', import.meta.url));
try {
  const { values } = parseArgs({ options: { email: { type: 'string' }, output: { type: 'string' }, origin: { type: 'string' }, 'rotate-existing': { type: 'boolean', default: false } } });
  dotenv.config({ path: path.join(root, 'backend/.env') });
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new AdminAccessError('Falta MONGODB_URI en el entorno privado.');
  if (process.env.NODE_ENV === 'production' && !uri.startsWith('mongodb+srv://') && !/[?&]tls=true(?:&|$)/.test(uri)) throw new AdminAccessError('Producción requiere MongoDB con TLS.');
  if (process.env.NODE_ENV === 'production' && !values.origin?.startsWith('https://')) throw new AdminAccessError('Indica --origin con el origen HTTPS de producción.');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000, maxPoolSize: 2 });
  const result = await provisionAdmin({ email: values.email, accessFile: path.resolve(root, values.output || 'backend/.env.admin-acceso.json'), origin: values.origin || 'http://127.0.0.1:3000', rotateExisting: values['rotate-existing'] });
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(error instanceof AdminAccessError ? error.message : `No se pudo preparar el administrador (${error.name}).`);
  process.exitCode = 1;
} finally { await mongoose.disconnect(); }
