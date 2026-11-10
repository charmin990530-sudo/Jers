/**
 * cartController.js - Controladores de Carrito de Compras
 *
 * RUTAS ASOCIADAS (routes/cart.js) - TODAS PROTEGIDAS (authenticate):
 * GET    /api/cart           -> getCart
 * POST   /api/cart           -> addToCart
 * PATCH  /api/cart/:itemId   -> updateCartItem
 * DELETE /api/cart/:itemId   -> removeFromCart
 * DELETE /api/cart           -> clearCart
 *
 * CONCURRENCIA:
 * Todas las mutaciones usan operaciones atómicas de un solo documento
 * ($inc posicional, $set posicional, $pull) en vez de read-modify-write con
 * save(). Dos peticiones concurrentes para el mismo item ya no pueden perder
 * incrementos ni duplicar filas: el driver serializa las escrituras sobre el
 * mismo subdocumento.
 *
 * STOCK:
 * El chequeo pre-escritura es advisory (rechaza temprano el caso obvio). El
 * cierre de la ventana de race esta en el chequeo post-escritura de addToCart,
 * que revierte el propio incremento si la cantidad quedo por encima del stock.
 * El gate REAL de sobreventa sigue siendo POST /api/orders (bulkWrite con
 * filtro stock: {$gte} condicional).
 */

import { Cart, Product } from '../models/index.js';
import { CANTIDAD_MAXIMA_POR_ITEM } from '../models/Cart.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { ErrorCodes } from '../middleware/apiError.js';
import { SHIPPING_RULES, TAX_RATE_BP } from '../config/env.js';
import {
  sumMinorAmounts,
  multiplyMinorAmount,
  computeOrderTotal,
  shippingCostFor,
  taxFor,
} from '../services/money.js';

const POBLAR_ITEMS = {
  path: 'items.producto',
  select: 'nombre slug precio precioAnterior imagenes stock activo',
  populate: { path: 'marca', select: 'nombre slug' },
};

/** Calcula el desglose (subtotal/envío/impuestos/total) para la respuesta. */
function desgloseCart(itemsValidos) {
  const subtotal = sumMinorAmounts(
    itemsValidos.map(item => multiplyMinorAmount(item.precioUnitario, item.cantidad, 'subtotal')),
    'subtotal',
  );
  const costoEnvio = shippingCostFor(subtotal, SHIPPING_RULES);
  const impuestos = taxFor(subtotal + costoEnvio, TAX_RATE_BP);
  const total = computeOrderTotal({ subtotal, shipping: costoEnvio, tax: impuestos });
  return {
    items: itemsValidos,
    totalItems: itemsValidos.reduce((sum, item) => sum + item.cantidad, 0),
    subtotal,
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
  // cada GET pero seguían en la base, y si el producto se reactivaba volvían
  // con el precio congelado viejo. El $pull con $nin deja solo los válidos.
  if (validItems.length !== cart.items.length) {
    const validIds = validItems.map(item => item._id);
    await Cart.updateOne(
      { _id: cart._id },
      { $pull: { items: { _id: { $nin: validIds } } } },
    );
  }

  res.status(200).json({ success: true, cart: desgloseCart(validItems) });
});

/**
 * POST /api/cart
 * Agrega producto al carrito (o incrementa cantidad si ya existe)
 * Body validado por schemas.addToCart: { productoId, cantidad }
 */
export const addToCart = asyncHandler(async (req, res, next) => {
  const { productoId, cantidad } = req.body;

  const producto = await Product.findById(productoId);
  if (!producto || !producto.activo) {
    return next(new AppError('Producto no encontrado o no disponible', 404, ErrorCodes.PRODUCT_NOT_FOUND));
  }

  // Chequeo pre-escritura (advisory): rechaza temprano el caso obvio sin
  // tocar el carrito. La ventana de race se cierra con el chequeo post-escritura.
  const preCart = await Cart.findOne({ usuario: req.userId }).select('items.producto items.cantidad');
  const preItem = preCart?.items?.find(item => item.producto.toString() === productoId);
  const preCantidad = preItem?.cantidad || 0;
  if (producto.stock < preCantidad + cantidad) {
    return next(new AppError(`Stock insuficiente. Disponible: ${producto.stock}`, 400, ErrorCodes.INSUFFICIENT_STOCK));
  }

  // Asegura que el carrito exista. El $setOnInsert + upsert es atómico; un
  // duplicate key concurrente significa que otra petición ya lo creó, no es error.
  await Cart.updateOne(
    { usuario: req.userId },
    { $setOnInsert: { usuario: req.userId, items: [], actualizadoEn: new Date() } },
    { upsert: true },
  ).catch(error => {
    if (error?.code !== 11000) throw error;
  });

  // $inc posicional: incrementa el item existente de forma atómica. Dos adds
  // concurrentes del mismo producto se serializan en el servidor, no se pisan.
  let cart = await Cart.findOneAndUpdate(
    { usuario: req.userId, 'items.producto': productoId },
    { $inc: { 'items.$.cantidad': cantidad }, $set: { actualizadoEn: new Date() } },
    { new: true },
  );

  if (!cart) {
    const nuevoItem = {
      producto: productoId,
      cantidad,
      precioUnitario: producto.precio,          // Snapshot: precio actual
      nombreSnapshot: producto.nombre,          // Snapshot: nombre actual
      imagenSnapshot: producto.imagenPrincipal, // Snapshot: imagen actual
    };
    // Guard $ne: solo hace push si el item NO existe ya, para no duplicar la
    // fila cuando dos peticiones crean el mismo producto en paralelo.
    cart = await Cart.findOneAndUpdate(
      { usuario: req.userId, 'items.producto': { $ne: productoId } },
      { $push: { items: nuevoItem }, $set: { actualizadoEn: new Date() } },
      { new: true },
    );

    if (!cart) {
      // El $ne no matcheó: otra petición agregó el item concurrentemente.
      // Se reintenta como incremento (el item ya existe ahora).
      cart = await Cart.findOneAndUpdate(
        { usuario: req.userId, 'items.producto': productoId },
        { $inc: { 'items.$.cantidad': cantidad }, $set: { actualizadoEn: new Date() } },
        { new: true },
      );
    }
  }

  if (!cart) {
    // Ni incremento ni push encontraron el carrito (caso límite): lo crea.
    cart = await Cart.create({
      usuario: req.userId,
      items: [{
        producto: productoId,
        cantidad,
        precioUnitario: producto.precio,
        nombreSnapshot: producto.nombre,
        imagenSnapshot: producto.imagenPrincipal,
      }],
    });
  }

  // Cierre de la ventana de race: si el incremento dejó la cantidad por encima
  // del stock (dos requests que pasaron el chequeo pre-escritura), se revierte
  // el propio incremento y se responde 400. Cada request revierte solo lo suyo,
  // así que si dos racaron, ambos revierten y el carrito vuelve al valor previo.
  //
  // Aquí se comprueba TAMBIEN el tope por producto (99 unidades). El esquema de
  // cada petición limita la cantidad de ESA llamada, pero no la que queda en el
  // carrito: con varias altas sucesivas el total del mismo producto se
  // accumulating hasta superar el tope y el servidor lo aceptaba. El frontend
  // lo recorta, pero el limite tiene que estar en el servidor.
  const itemActualizado = cart.items?.find(item => item.producto.toString() === productoId);
  if (itemActualizado && itemActualizado.cantidad > CANTIDAD_MAXIMA_POR_ITEM) {
    await Cart.findOneAndUpdate(
      { usuario: req.userId, 'items.producto': productoId },
      { $inc: { 'items.$.cantidad': -cantidad }, $set: { actualizadoEn: new Date() } },
    );
    return next(new AppError(
      `La cantidad máxima por producto es ${CANTIDAD_MAXIMA_POR_ITEM}.`,
      400,
      ErrorCodes.INVALID_QUANTITY,
    ));
  }
  if (itemActualizado && itemActualizado.cantidad > producto.stock) {
    await Cart.findOneAndUpdate(
      { usuario: req.userId, 'items.producto': productoId },
      { $inc: { 'items.$.cantidad': -cantidad }, $set: { actualizadoEn: new Date() } },
    );
    return next(new AppError(`Stock insuficiente. Disponible: ${producto.stock}`, 400, ErrorCodes.INSUFFICIENT_STOCK));
  }

  const { itemsValidos } = await cargarCarritoPoblado(cart._id);

  res.status(200).json({
    success: true,
    message: 'Producto agregado al carrito',
    cart: desgloseCart(itemsValidos),
  });
});

/**
 * PATCH /api/cart/:itemId
 * Actualiza cantidad de un item específico (por _id del subdocumento)
 * Si cantidad < 1 -> elimina el item con $pull atómico
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

  // Escritura atómica por _id del subdocumento: sin read-modify-write perdido.
  if (cantidad < 1) {
    await Cart.findOneAndUpdate(
      { usuario: req.userId },
      { $pull: { items: { _id: itemId } }, $set: { actualizadoEn: new Date() } },
    );
  } else {
    await Cart.findOneAndUpdate(
      { usuario: req.userId, 'items._id': itemId },
      { $set: { 'items.$.cantidad': cantidad, actualizadoEn: new Date() } },
    );
  }

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

  await Cart.findOneAndUpdate(
    { usuario: req.userId },
    { $pull: { items: { _id: itemId } }, $set: { actualizadoEn: new Date() } },
  );

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
export const clearCart = asyncHandler(async (req, res) => {
  await Cart.findOneAndUpdate(
    { usuario: req.userId },
    { $set: { items: [], actualizadoEn: new Date() } },
  );

  res.status(200).json({
    success: true,
    message: 'Carrito vaciado',
    cart: desgloseCart([]),
  });
});
