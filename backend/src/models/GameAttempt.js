import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  challenge: { type: String, enum: ['libre', 'natural', 'noche', 'editorial'], required: true },
  steps: { type: [String], default: [] },
  revision: { type: Number, default: 0 },
  participated: { type: Boolean, default: false },
  completed: { type: Boolean, default: false },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
}, { timestamps: true });
// Se guardan pasos cumplidos, nunca la imagen ni el look completo.
schema.index({ usuario: 1, expiresAt: 1 });
export default mongoose.model('GameAttempt', schema);
