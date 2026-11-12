import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tipo: { type: String, enum: ['acceso', 'supresion', 'revocacion'], required: true },
  mensaje: { type: String, maxlength: 500, default: '' },
  estado: { type: String, enum: ['pendiente', 'resuelta'], default: 'pendiente' },
  respuesta: { type: String, maxlength: 1000, default: '' },
  resueltaEn: Date,
}, { timestamps: true });
schema.index({ usuario: 1, tipo: 1 }, { unique: true, partialFilterExpression: { estado: 'pendiente' } });
schema.index({ estado: 1, createdAt: 1 });
export default mongoose.model('DataRequest', schema);
