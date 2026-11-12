import express from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AppError, ErrorCodes } from '../middleware/apiError.js';
import GameAttempt from '../models/GameAttempt.js';
import GameReward from '../models/GameReward.js';
import { Product } from '../models/index.js';
import { challengeIds, categorySchema, categoryIds, optionSchema, stepMatches, cosmeticType } from '../services/gameRules.js';
import { grantReward, publicReward } from '../services/gameRewards.js';

const router = express.Router();
// Solo catálogo público, sin suponer equivalencias de tonos o variantes.
router.get('/products', asyncHandler(async (_req, res) => {
  const products = await Product.find({ activo: true, nombre: { $regex: /^(?:labial\b|paleta.*sombras|sombras|rubor|delineador)/i } })
    .select('nombre slug precio precioAnterior stock imagenes categoria marca').sort({ _id: 1 }).limit(24).lean();
  res.json({ success: true, products: products.map(product => ({ ...product, cosmeticType: cosmeticType(product) })) });
}));
router.use(authenticate);
router.get('/rewards', asyncHandler(async (req, res) => {
  const rewards = await GameReward.find({ usuario: req.userId }).sort({ createdAt: 1 });
  res.json({ success: true, rewards: rewards.map(publicReward) });
}));
router.post('/attempts', validate(z.object({ challenge: z.enum(challengeIds) }).strict()), asyncHandler(async (req, res) => {
  const count = await GameAttempt.countDocuments({ usuario: req.userId, expiresAt: { $gt: new Date() } });
  if (count >= 40) throw new AppError('Has abierto muchas sesiones del estudio. Puedes volver a jugar más tarde.', 429, ErrorCodes.RATE_LIMIT_EXCEEDED);
  const attempt = await GameAttempt.create({ usuario: req.userId, challenge: req.body.challenge, expiresAt: new Date(Date.now() + 86400000) });
  res.status(201).json({ success: true, attempt: { id: String(attempt._id), revision: 0 } });
}));
router.param('id', (req, _res, next, value) => /^[a-f\d]{24}$/i.test(value) ? next() : next(new AppError('Sesión de juego inválida.', 400, ErrorCodes.INVALID_ID)));
const findAttempt = req => GameAttempt.findOne({ _id: req.params.id, usuario: req.userId, expiresAt: { $gt: new Date() } });
router.patch('/attempts/:id/step', validate(z.object({
  revision: z.number().int().min(0).max(100000),
  category: categorySchema,
  option: optionSchema.nullable(),
}).strict().refine(body => !body.option || body.option.category === body.category, 'Herramienta inconsistente.')), asyncHandler(async (req, res) => {
  const attempt = await findAttempt(req);
  if (!attempt) throw new AppError('La sesión del estudio caducó. Abre un nuevo reto.', 404, ErrorCodes.NOT_FOUND);
  const { category, option, revision } = req.body;
  if (revision !== attempt.revision) throw new AppError('El estudio cambió en otra acción. Vuelve a intentarlo.', 409, ErrorCodes.GAME_STATE_CHANGED);
  const steps = attempt.steps.filter(id => id !== category);
  if (option && stepMatches(attempt.challenge, option)) steps.push(category);
  const updated = await GameAttempt.findOneAndUpdate({ _id: attempt._id, usuario: req.userId, revision, expiresAt: { $gt: new Date() } },
    { $set: { steps, completed: false, participated: attempt.participated || !!option }, $inc: { revision: 1 } }, { new: true });
  if (!updated) throw new AppError('El estudio cambió en otra acción. Vuelve a intentarlo.', 409, ErrorCodes.GAME_STATE_CHANGED);
  if (option) await grantReward(req.userId, 'play-lips', attempt.challenge);
  res.json({ success: true, revision: updated.revision, steps: updated.steps });
}));
router.post('/attempts/:id/complete', validate(z.object({}).strict()), asyncHandler(async (req, res) => {
  const attempt = await findAttempt(req);
  if (!attempt) throw new AppError('La sesión del estudio caducó. Abre un nuevo reto.', 404, ErrorCodes.NOT_FOUND);
  const won = attempt.challenge !== 'libre' && categoryIds.every(category => attempt.steps.includes(category));
  if (!attempt.participated || (attempt.challenge !== 'libre' && !won)) throw new AppError('Completa los pasos indicados antes de terminar el reto.', 400, ErrorCodes.GAME_INCOMPLETE);
  const updated = await GameAttempt.updateOne({ _id: attempt._id, revision: attempt.revision, expiresAt: { $gt: new Date() } }, { $set: { completed: true } });
  if (updated.matchedCount !== 1) throw new AppError('El look cambió antes de terminar. Vuelve a comprobar los pasos.', 409, ErrorCodes.GAME_STATE_CHANGED);
  if (won) await grantReward(req.userId, 'win-store', attempt.challenge);
  const rewards = await GameReward.find({ usuario: req.userId });
  res.json({ success: true, won, rewards: rewards.map(publicReward) });
}));
export default router;
