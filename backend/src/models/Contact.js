import mongoose from 'mongoose';

const contactSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
  telefono: { type: String, trim: true, maxlength: 30 },
  mensaje: { type: String, required: true, trim: true, maxlength: 2000 },
  estado: { type: String, enum: ['nuevo', 'atendido'], default: 'nuevo' },
}, { timestamps: true });

// El panel de admin filtra por estado y ordena por fecha descripcion, y ademas
// pagina. Este indice compuesto evita el escaneo completo en cada carga.
contactSchema.index({ estado: 1, createdAt: -1 });

export default mongoose.model('Contact', contactSchema);
