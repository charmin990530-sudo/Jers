import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  kind: { type: String, enum: ['play-lips', 'win-store'], required: true },
  sourceChallenge: { type: String, enum: ['libre', 'natural', 'noche', 'editorial'], required: true },
  redeemedBy: { type: String, default: null, select: false },
  redeemedAt: { type: Date, default: null },
}, { timestamps: true });
// Una recompensa de cada tipo por cuenta, también bajo peticiones simultáneas.
schema.index({ usuario: 1, kind: 1 }, { unique: true });
export default mongoose.model('GameReward', schema);
