import { Product } from '../models/index.js';

const adjustment = (item, direction) => ({
  updateOne: {
    filter: { _id: item.producto },
    update: { $inc: { stock: direction * item.cantidad, vendidos: -direction * item.cantidad } },
  },
});

/** Sin transacción, registrar cada línea aplicada antes de continuar con la siguiente. */
export async function restoreOrderStock(items, { session, onApplied } = {}) {
  if (session) {
    await Product.bulkWrite(items.map(item => adjustment(item, 1)), { session, ordered: true });
    return;
  }
  for (const item of items) {
    const operation = adjustment(item, 1).updateOne;
    const result = await Product.updateOne(operation.filter, operation.update);
    if (result.modifiedCount === 1) onApplied?.(item);
  }
}

export async function undoRestoredStock(items) {
  if (items.length) await Product.bulkWrite(items.map(item => adjustment(item, -1)), { ordered: false });
}
