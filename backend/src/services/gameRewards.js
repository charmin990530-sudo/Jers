import GameReward from '../models/GameReward.js';
import { rewardRules, cosmeticType } from './gameRules.js';
import { AppError, ErrorCodes } from '../middleware/apiError.js';
import { sumMinorAmounts, multiplyMinorAmount, percentOfMinorAmount } from './money.js';

export const publicReward = reward => ({
  id: String(reward._id), kind: reward.kind, ...rewardRules[reward.kind],
  redeemedAt: reward.redeemedAt, createdAt: reward.createdAt,
});

export async function grantReward(usuario, kind, sourceChallenge) {
  try {
    return await GameReward.findOneAndUpdate({ usuario, kind }, { $setOnInsert: { usuario, kind, sourceChallenge } }, { upsert: true, new: true });
  } catch (error) {
    if (error.code !== 11000) throw error;
    return GameReward.findOne({ usuario, kind });
  }
}

export async function quoteReward(rewardId, usuario, items, subtotal) {
  if (rewardId === undefined || rewardId === '') return { descuento: 0, premio: null };
  if (typeof rewardId !== 'string' || !/^[a-f\d]{24}$/i.test(rewardId)) throw new AppError('Premio inválido.', 400, ErrorCodes.INVALID_ID);
  const reward = await GameReward.findOne({ _id: rewardId, usuario, redeemedAt: null, redeemedBy: null });
  if (!reward) throw new AppError('Ese premio no está disponible para tu cuenta.', 409, ErrorCodes.REWARD_UNAVAILABLE);
  const rules = rewardRules[reward.kind];
  if (rules.minimumExclusive && subtotal <= rules.minimumExclusive) throw new AppError('El premio de toda la tienda requiere un subtotal superior a $150.000 COP, antes de envío e impuestos.', 400, ErrorCodes.REWARD_NOT_ELIGIBLE);
  const eligible = items.filter(item => rules.scope === 'tienda' || cosmeticType(item.producto) === 'labios');
  const base = sumMinorAmounts(eligible.map(item => multiplyMinorAmount(item.producto.precio, item.cantidad)));
  if (!base) throw new AppError('Añade al menos un labial disponible para usar este premio.', 400, ErrorCodes.REWARD_NOT_ELIGIBLE);
  return { descuento: percentOfMinorAmount(base, rules.percent), premio: publicReward(reward) };
}
