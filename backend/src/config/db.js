/**
 * db.js - Conexión a MongoDB usando Mongoose
 * Exporta función connectDB() que se llama al iniciar el servidor
 */
import mongoose from 'mongoose';
import { MONGODB_URI } from './env.js';

/**
 * Conecta a MongoDB usando la URI de configuración
 * Si falla, loggea el error y mata el proceso (exit 1)
 * En desarrollo muestra el host conectado para debugging
 */
export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(MONGODB_URI);
    console.log(`MongoDB conectado: ${conn.connection.host}`);
  } catch (error) {
    console.error('Error conectando a MongoDB', { name: error.name });
    process.exit(1);
  }
};