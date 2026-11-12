/** Carrito propio: cantidades acotadas en escrituras atómicas y bloqueo de checkout. */
import { Cart, Product } from '../models/index.js';
import { CANTIDAD_MAXIMA_POR_ITEM } from '../models/Cart.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { ErrorCodes } from '../middleware/apiError.js';
import { SHIPPING_RULES, TAX_RATE_BP } from '../config/env.js';
import { quoteReward } from '../services/gameRewards.js';
import {
  sumMinorAmounts,
  multiplyMinorAmount,
  computeOrderTotal,
  shippingCostFor,
  taxFor,
} from '../services/money.js';

// Un checkout vivo excluye mutaciones del carrito hasta que termine o venza.
const editableCart = () => ({ $or: [
  { checkoutToken: { $exists: false } }, { checkoutToken: null },
  { checkoutExpiresAt: { $lte: new Date() } },
] });

const POBLAR_ITEMS = {
  path: 'items.producto',
  select: 'nombre slug precio precioAnterior imagenes stock activo',
  populate: { path: 'marca', select: 'nombre slug' },
};

/** Calcula el desglose (subtotal/envío/impuestos/total) para la respuesta. */
function desgloseCart(itemsValidos, reward = { descuento: 0, premio: null }) {
  // El checkout usa el precio vigente; el resumen debe mostrar el mismo importe.
  itemsValidos = itemsValidos.map(item => ({ ...item, precioUnitario: item.producto.precio }));
  const subtotal = sumMinorAmounts(
    itemsValidos.map(item => multiplyMinorAmount(item.precioUnitario, item.cantidad, 'subtotal')),
    'subtotal',
  );
  const costoEnvio = shippingCostFor(subtotal, SHIPPING_RULES);
  const impuestos = taxFor(subtotal - reward.descuento + costoEnvio, TAX_RATE_BP);
  const total = computeOrderTotal({ subtotal: subtotal - reward.descuento, shipping: costoEnvio, tax: impuestos });
  return {
    items: itemsValidos,
    totalItems: itemsValidos.reduce((sum, item) => sum + item.cantidad, 0),
    subtotal,
    ...reward,
    // El desglose viaja con el carrito para que el checkout pueda mostrar el
    // importe que REALMENTE se va a cobrar. Antes el frontend sumaba el
    // subtotal y lo llamaba "Total", y el servidor cobraba subtotal + envío:
    // el cliente descubria los $15.000 de envío al confirmar.
    costoEnvio,
    impuestos,
    tasaImpuestosBp: TAX_RATE_BP,
    total,
    envioGratisDesde: SHIPPING_RULES.freeFrom,
  };
}

/** Carga el carrito poblado y devuelve { cart, itemsValidos }. */
async function cargarCarritoPoblado(cartId) {
  const cart = await Cart.findById(cartId).populate(POBLAR_ITEMS).lean();
  const itemsValidos = (cart?.items || []).filter(
    item => item.producto && item.producto.activo && item.producto.stock > 0,
  );
  return { cart, itemsValidos };
}

/**
 * GET /api/cart
 * Obtiene carrito del usuario con items poblados
 * Filtra: solo productos activos y con stock > 0, y PERSISTE la limpieza.
 */
export const getCart = asyncHandler(async (req, res) => {
  let cart = await Cart.findOne({ usuario: req.userId })
    .populate(POBLAR_ITEMS)
    .lean();

  if (!cart) {
    cart = { usuario: req.userId, items: [], totalItems: 0, subtotal: 0 };
  }

  const validItems = cart.items.filter(
    item => item.producto && item.producto.activo && item.producto.stock > 0,
  );

  // Persistir la limpieza: sin esto, los items inválidos se re-filtraban en
  // cada GET. Eliminar solo los IDs inválidos de esa lectura protege las altas concurrentes.
  if (validItems.length !== cart.items.length) {
    const invalidIds = cart.items.filter(item => !item.producto || !item.producto.activo || item.producto.stock <= 0).map(item => item._id);
    await Cart.updateOne(
      { _id: cart._id, ...editableCart() },
      { $pull: { items: { _id: { $in: invalidIds } } } },
    );
  }

  const subtotal = sumMinorAmounts(validItems.map(item => multiplyMinorAmount(item.producto.precio, item.cantidad)));
  const reward = await quoteReward(req.query.rewardId, req.userId, validItems, subtotal);
  res.status(200).json({ success: true, cart: desgloseCart(validItems, reward) });
});

/**
 * POST /api/cart
 * Agrega producto al carrito (o incrementa cantidad si ya existe)
 * Body validado por schemas.addToCart: { productoId, cantidad }
 */
export const addToCart = asyncHandler(async (req, res, next) => {
  const { productoId, cantidad } = req.body;
  const producto = await Product.findById(productoId);
  if (!producto || !producto.activo) return next(new AppError('Producto no encontrado o no disponible', 404, ErrorCodes.PRODUCT_NOT_FOUND));
  if (cantidad > producto.stock) return next(new AppError(`Stock insuficiente. Disponible: ${producto.stock}`, 400, ErrorCodes.INSUFFICIENT_STOCK));
  const limit = Math.min(CANTIDAD_MAXIMA_POR_ITEM, producto.stock);
  await Cart.updateOne(
    { usuario: req.userId },
    { $setOnInsert: { usuario: req.userId, items: [], actualizadoEn: new Date() } },
    { upsert: true, timestamps: false },
  ).catch(error => { if (error?.code !== 11000) throw error; });

  // El límite forma parte de la escritura atómica: nunca se incrementa de más
  // ni se resta después, lo que podría pisar una edición simultánea.
  const increment = () => Cart.findOneAndUpdate(
    { usuario: req.userId, ...editableCart(), items: { $elemMatch: { producto: producto._id, cantidad: { $lte: limit - cantidad } } } },
    { $inc: { 'items.$.cantidad': cantidad }, $set: { actualizadoEn: new Date() } },
    { new: true },
  );
  let cart = await increment();
  if (!cart) {
    cart = await Cart.findOneAndUpdate(
      { usuario: req.userId, ...editableCart(), 'items.producto': { $ne: producto._id } },
      { $push: { items: { producto: producto._id, cantidad, precioUnitario: producto.precio, nombreSnapshot: producto.nombre, imagenSnapshot: producto.imagenPrincipal } }, $set: { actualizadoEn: new Date() } },
      { new: true },
    );
    if (!cart) cart = await increment();
  }
  if (!cart) {
    const current = await Cart.findOne({ usuario: req.userId }).select('+checkoutToken +checkoutExpiresAt');
    if (!current || (current.checkoutToken && current.checkoutExpiresAt > new Date())) return next(new AppError('El carrito está confirmándose o cambió. Actualiza antes de continuar.', 409, ErrorCodes.CHECKOUT_IN_PROGRESS));
    const quantity = current.items.find(item => String(item.producto) === productoId)?.cantidad ?? 0;
    if (quantity + cantidad > CANTIDAD_MAXIMA_POR_ITEM) return next(new AppError(`La cantidad máxima por producto es ${CANTIDAD_MAXIMA_POR_ITEM}.`, 400, ErrorCodes.INVALID_QUANTITY));
    return next(new AppError(`Stock insuficiente. Disponible: ${producto.stock}`, 400, ErrorCodes.INSUFFICIENT_STOCK));
  }
  const { itemsValidos } = await cargarCarritoPoblado(cart._id);
  res.status(200).json({ success: true, message: 'Producto agregado al carrito', cart: desgloseCart(itemsValidos) });
});

/**
 * PATCH /api/cart/:itemId
 * Actualiza cantidad de un item específico (por _id del subdocumento)
 */
export const updateCartItem = asyncHandler(async (req, res, next) => {
  const { cantidad } = req.body;
  const { itemId } = req.params;

  const cart = await Cart.findOne({ usuario: req.userId });
  if (!cart) {
    return next(new AppError('Carrito no encontrado', 404, ErrorCodes.CART_NOT_FOUND));
  }

  const item = cart.items.id(itemId);
  if (!item) {
    return next(new AppError('Producto no encontrado en el carrito', 404, ErrorCodes.ITEM_NOT_FOUND));
  }

  // Verifica producto actual (puede haber cambiado desde que se agregó)
  const producto = await Product.findById(item.producto);
  if (!producto || !producto.activo) {
    return next(new AppError('Producto no disponible', 400, ErrorCodes.PRODUCT_UNAVAILABLE));
  }

  if (producto.stock < cantidad) {
    return next(new AppError(`Stock insuficiente. Disponible: ${producto.stock}`, 400, ErrorCodes.INSUFFICIENT_STOCK));
  }

  const updated = await Cart.findOneAndUpdate(
    { usuario: req.userId, ...editableCart(), 'items._id': itemId },
    { $set: { 'items.$.cantidad': cantidad, actualizadoEn: new Date() } },
    { new: true },
  );
  if (!updated) return next(new AppError('El carrito cambió o está confirmándose. Actualiza antes de continuar.', 409, ErrorCodes.CHECKOUT_IN_PROGRESS));

  const { itemsValidos } = await cargarCarritoPoblado(cart._id);

  res.status(200).json({
    success: true,
    message: 'Carrito actualizado',
    cart: desgloseCart(itemsValidos),
  });
});

/**
 * DELETE /api/cart/:itemId
 * Elimina un item específico del carrito con $pull atómico
 */
export const removeFromCart = asyncHandler(async (req, res, next) => {
  const { itemId } = req.params;

  const cart = await Cart.findOne({ usuario: req.userId });
  if (!cart) {
    return next(new AppError('Carrito no encontrado', 404, ErrorCodes.CART_NOT_FOUND));
  }

  const item = cart.items.id(itemId);
  if (!item) {
    return next(new AppError('Producto no encontrado en el carrito', 404, ErrorCodes.ITEM_NOT_FOUND));
  }

  const updated = await Cart.findOneAndUpdate(
    { usuario: req.userId, ...editableCart(), 'items._id': itemId },
    { $pull: { items: { _id: itemId } }, $set: { actualizadoEn: new Date() } },
    { new: true },
  );
  if (!updated) return next(new AppError('El carrito cambió o está confirmándose.', 409, ErrorCodes.CHECKOUT_IN_PROGRESS));

  const { itemsValidos } = await cargarCarritoPoblado(cart._id);

  res.status(200).json({
    success: true,
    message: 'Producto eliminado del carrito',
    cart: desgloseCart(itemsValidos),
  });
});

/**
 * DELETE /api/cart
 * Vacía completamente el carrito del usuario (atómico, sin save())
 */
export const clearCart = asyncHandler(async (req, res, next) => {
  const updated = await Cart.findOneAndUpdate(
    { usuario: req.userId, ...editableCart() },
    { $set: { items: [], actualizadoEn: new Date() } },
    { new: true },
  );
  if (!updated && await Cart.exists({ usuario: req.userId })) return next(new AppError('El carrito está confirmándose.', 409, ErrorCodes.CHECKOUT_IN_PROGRESS));

  res.status(200).json({
    success: true,
    message: 'Carrito vaciado',
    cart: desgloseCart([]),
  });
});
