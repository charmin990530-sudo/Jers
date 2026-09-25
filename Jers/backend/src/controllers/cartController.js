/**
 * cartController.js - Controladores de Carrito de Compras
 * 
 * RUTAS ASOCIADAS (routes/cart.js) - TODAS PROTEGIDAS (authenticate):
 * GET    /api/cart           -> getCarrito
 * POST   /api/cart           -> addToCart
 * PATCH  /api/cart/:itemId   -> updateCartItem
 * DELETE /api/cart/:itemId   -> removeFromCart
 * DELETE /api/cart           -> clearCart
 * 
 * FLUJO:
 * 1. Usuario logueado -> req.userId disponible
 * 2. Un carrito por usuario (unique index en modelo)
 * 3. Items tienen snapshot de precio (precioUnitario) al momento de agregar
 * 4. Validación de stock en tiempo real antes de agregar/actualizar
 * 5. Filtra items de productos inactivos/sin stock en responses
 * 
 * SINCRONIZACIÓN FRONTEND:
 * - Frontend usa localStorage como cache offline
 * - Al loguearse, frontend debe hacer sync: POST /api/cart con items locales
 * - Backend mergea (suma cantidades si mismo producto)
 */

import { Cart, Product } from '../models/index.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';

/**
 * GET /api/cart
 * Obtiene carrito del usuario con items poblados
 * Filtra: solo productos activos y con stock > 0
 * Recalcula subtotal basado en precioUnitario (snapshot)
 */
export const getCart = asyncHandler(async (req, res) => {
  let cart = await Cart.findOne({ usuario: req.userId })
    .populate({
      path: 'items.producto',
      select: 'nombre slug precio precioAnterior imagenes stock activo',
      populate: { path: 'marca', select: 'nombre slug' },
    })
    .lean();

  // Si no existe carrito, devuelve estructura vacía
  if (!cart) {
    cart = { usuario: req.userId, items: [], totalItems: 0, subtotal: 0 };
  }

  // Filtra items válidos (producto existe, activo, con stock)
  const validItems = cart.items.filter(item => item.producto && item.producto.activo && item.producto.stock > 0);
  const subtotal = validItems.reduce((sum, item) => sum + (item.precioUnitario * item.cantidad), 0);

  res.status(200).json({
    success: true,
    cart: {
      items: validItems,
      totalItems: validItems.reduce((sum, item) => sum + item.cantidad, 0),
      subtotal,
    },
  });
});

/**
 * POST /api/cart
 * Agrega producto al carrito (o incrementa cantidad si ya existe)
 * Body validado por schemas.addToCart: { productoId, cantidad }
 * Valida: producto existe, activo, stock suficiente
 */
export const addToCart = asyncHandler(async (req, res, next) => {
  const { productoId, cantidad } = req.body;

  const producto = await Product.findById(productoId);
  if (!producto || !producto.activo) {
    return next(new AppError('Producto no encontrado o no disponible', 404, 'PRODUCT_NOT_FOUND'));
  }

  let cart = await Cart.findOne({ usuario: req.userId });
  if (!cart) cart = await Cart.create({ usuario: req.userId, items: [] });

  const itemExistente = cart.items.find(item => item.producto.toString() === productoId);
  const cantidadActual = itemExistente?.cantidad || 0;
  if (producto.stock < cantidadActual + cantidad) {
    return next(new AppError(`Stock insuficiente. Disponible: ${producto.stock}`, 400, 'INSUFFICIENT_STOCK'));
  }

  await cart.agregarItem(producto, cantidad);

  // Devuelve carrito actualizado poblado
  cart = await Cart.findById(cart._id)
    .populate({
      path: 'items.producto',
      select: 'nombre slug precio precioAnterior imagenes stock activo',
      populate: { path: 'marca', select: 'nombre slug' },
    })
    .lean();

  const validItems = cart.items.filter(item => item.producto && item.producto.activo);
  const subtotal = validItems.reduce((sum, item) => sum + (item.precioUnitario * item.cantidad), 0);

  res.status(200).json({
    success: true,
    message: 'Producto agregado al carrito',
    cart: {
      items: validItems,
      totalItems: validItems.reduce((sum, item) => sum + item.cantidad, 0),
      subtotal,
    },
  });
});

/**
 * PATCH /api/cart/:itemId
 * Actualiza cantidad de un item específico
 * Valida: item existe, producto activo, stock suficiente
 * Si cantidad < 1 -> elimina item (delega a modelo)
 */
export const updateCartItem = asyncHandler(async (req, res, next) => {
  const { cantidad } = req.body;
  const { itemId } = req.params;  // _id del subdocumento item

  let cart = await Cart.findOne({ usuario: req.userId });
  if (!cart) {
    return next(new AppError('Carrito no encontrado', 404, 'CART_NOT_FOUND'));
  }

  // Busca subdocumento por _id (Mongoose document.id())
  const item = cart.items.id(itemId);
  if (!item) {
    return next(new AppError('Producto no encontrado en el carrito', 404, 'ITEM_NOT_FOUND'));
  }

  // Verifica producto actual (puede haber cambiado desde que se agregó)
  const producto = await Product.findById(item.producto);
  if (!producto || !producto.activo) {
    return next(new AppError('Producto no disponible', 400, 'PRODUCT_UNAVAILABLE'));
  }

  if (producto.stock < cantidad) {
    return next(new AppError(`Stock insuficiente. Disponible: ${producto.stock}`, 400, 'INSUFFICIENT_STOCK'));
  }

  // Modelo maneja: actualiza cantidad o elimina si < 1
  await cart.actualizarCantidad(item.producto, cantidad);

  // Devuelve carrito actualizado
  cart = await Cart.findById(cart._id)
    .populate({
      path: 'items.producto',
      select: 'nombre slug precio precioAnterior imagenes stock activo',
      populate: { path: 'marca', select: 'nombre slug' },
    })
    .lean();

  const validItems = cart.items.filter(i => i.producto && i.producto.activo);
  const subtotal = validItems.reduce((sum, i) => sum + (i.precioUnitario * i.cantidad), 0);

  res.status(200).json({
    success: true,
    message: 'Carrito actualizado',
    cart: {
      items: validItems,
      totalItems: validItems.reduce((sum, i) => sum + i.cantidad, 0),
      subtotal,
    },
  });
});

/**
 * DELETE /api/cart/:itemId
 * Elimina un item específico del carrito
 */
export const removeFromCart = asyncHandler(async (req, res, next) => {
  const { itemId } = req.params;

  let cart = await Cart.findOne({ usuario: req.userId });
  if (!cart) {
    return next(new AppError('Carrito no encontrado', 404, 'CART_NOT_FOUND'));
  }

  const item = cart.items.id(itemId);
  if (!item) {
    return next(new AppError('Producto no encontrado en el carrito', 404, 'ITEM_NOT_FOUND'));
  }

  await cart.eliminarItem(item.producto);

  cart = await Cart.findById(cart._id)
    .populate({
      path: 'items.producto',
      select: 'nombre slug precio precioAnterior imagenes stock activo',
      populate: { path: 'marca', select: 'nombre slug' },
    })
    .lean();

  const validItems = cart.items?.filter(i => i.producto && i.producto.activo) || [];
  const subtotal = validItems.reduce((sum, i) => sum + (i.precioUnitario * i.cantidad), 0);

  res.status(200).json({
    success: true,
    message: 'Producto eliminado del carrito',
    cart: {
      items: validItems,
      totalItems: validItems.reduce((sum, i) => sum + i.cantidad, 0),
      subtotal,
    },
  });
});

/**
 * DELETE /api/cart
 * Vacía completamente el carrito del usuario
 */
export const clearCart = asyncHandler(async (req, res) => {
  let cart = await Cart.findOne({ usuario: req.userId });
  if (cart) {
    await cart.limpiar();
  }

  res.status(200).json({
    success: true,
    message: 'Carrito vaciado',
    cart: { items: [], totalItems: 0, subtotal: 0 },
  });
});