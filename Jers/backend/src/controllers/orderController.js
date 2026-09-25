/**
 * orderController.js - Controladores de Pedidos/Órdenes
 * 
 * RUTAS ASOCIADAS (routes/orders.js) - TODAS PROTEGIDAS (authenticate):
 * POST   /api/orders              -> createOrder (checkout)
 * GET    /api/orders              -> getOrders (listar mis pedidos)
 * GET    /api/orders/:id          -> getOrder (detalle pedido)
 * PATCH  /api/orders/:id/cancelar -> cancelOrder
 * 
 * FLUJO CREAR PEDIDO:
 * 1. Valida carrito no vacío
 * 2. Verifica cada item: producto activo, stock suficiente
 * 3. Calcula subtotal, envío (gratis >= 200k), total
 * 4. Crea Order con snapshot de items (precio actual, no del carrito)
 * 5. Decrementa stock + incrementa vendidos (atómico $inc)
 * 6. Elimina carrito
 * 7. Genera mensaje WhatsApp con detalles + numeroOrden
 * 8. Devuelve whatsappUrl para redirigir frontend
 * 
 * ESTADOS PEDIDO (ver modelo Order):
 * pendiente -> confirmado -> procesando -> enviado -> entregado
 *     ↓              ↓
 *  cancelado     reembolsado
 * 
 * CANCELACIÓN:
 * - Solo si estado en ['pendiente', 'confirmado'] (virtual puedeCancelar)
 * - Restaura stock + decrementa vendidos
 * - Guarda motivo
 */

import { randomUUID } from 'crypto';
import { Order, Cart, Product, User } from '../models/index.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { WHATSAPP_NUMBER } from '../config/env.js';

const serializeOrder = order => ({
  ...order,
  puedeCancelar: ['pendiente', 'confirmado'].includes(order?.estado),
});

/**
 * POST /api/orders
 * Checkout: convierte carrito en pedido
 * Body validado por schemas.createOrder: { direccionEnvio, notas? }
 * Devuelve whatsappUrl para abrir en nueva pestaña
 */
export const createOrder = asyncHandler(async (req, res, next) => {
  const { direccionEnvio, notas } = req.body;
  const idempotencyKey = req.get('Idempotency-Key')?.trim();
  if (idempotencyKey && !/^[A-Za-z0-9._:-]{8,100}$/.test(idempotencyKey)) {
    return next(new AppError('Idempotency-Key inválida', 400, 'INVALID_IDEMPOTENCY_KEY'));
  }
  if (idempotencyKey) {
    const existingOrder = await Order.findOne({ usuario: req.userId, idempotencyKey }).select('+idempotencyKey');
    if (existingOrder) {
      return res.status(200).json({
        success: true,
        message: 'El pedido ya había sido creado',
        order: {
          id: existingOrder._id,
          numeroOrden: existingOrder.numeroOrden,
          total: existingOrder.total,
          estado: existingOrder.estado,
          whatsappUrl: null,
        },
      });
    }
  }

  // Obtiene carrito con productos poblados
  const cart = await Cart.findOne({ usuario: req.userId })
    .populate('items.producto');

  if (!cart || cart.items.length === 0) {
    return next(new AppError('El carrito está vacío', 400, 'EMPTY_CART'));
  }

  const validItems = [];
  let subtotal = 0;

  // Valida cada item contra BD actual (stock, precio, disponibilidad)
  for (const item of cart.items) {
    const producto = item.producto;
    if (!producto || !producto.activo) {
      return next(new AppError(`El producto ${item.nombreSnapshot} ya no está disponible`, 400, 'PRODUCT_UNAVAILABLE'));
    }
    if (producto.stock < item.cantidad) {
      return next(new AppError(`Stock insuficiente para ${producto.nombre}. Disponible: ${producto.stock}`, 400, 'INSUFFICIENT_STOCK'));
    }

    // Snapshot con PRECIO ACTUAL (puede haber cambiado desde que agregó al carrito)
    validItems.push({
      producto: producto._id,
      nombre: producto.nombre,
      imagen: producto.imagenPrincipal,
      precioUnitario: producto.precio,
      cantidad: item.cantidad,
      subtotal: producto.precio * item.cantidad,
    });

    subtotal += producto.precio * item.cantidad;
  }

  // Lógica envío: gratis si subtotal >= 200.000 COP
  const costoEnvio = subtotal >= 200000 ? 0 : 15000;
  const total = subtotal + costoEnvio;

  const checkoutToken = randomUUID();
  const checkoutExpiresAt = new Date(Date.now() + 2 * 60 * 1000);
  const claimedCart = await Cart.findOneAndUpdate(
    {
      _id: cart._id,
      $or: [
        { checkoutToken: { $exists: false } },
        { checkoutToken: null },
        { checkoutExpiresAt: { $lte: new Date() } },
      ],
    },
    { $set: { checkoutToken, checkoutExpiresAt } },
    { new: true },
  );
  if (!claimedCart) {
    return next(new AppError('Ya hay un checkout en curso para este carrito', 409, 'CHECKOUT_IN_PROGRESS'));
  }

  let order;
  let checkoutClaimed = true;
  const reserved = [];
  try {
    for (const item of validItems) {
      const reservedProduct = await Product.findOneAndUpdate(
        { _id: item.producto, stock: { $gte: item.cantidad } },
        { $inc: { stock: -item.cantidad, vendidos: item.cantidad } },
        { new: false }
      );
      if (!reservedProduct) {
        throw new AppError(`Stock insuficiente para ${item.nombre}`, 400, 'INSUFFICIENT_STOCK');
      }
      reserved.push(item);
    }

    order = await Order.create({
      usuario: req.userId,
      items: validItems,
      subtotal,
      costoEnvio,
      total,
      direccionEnvio,
      notas,
      metodoPago: 'whatsapp',
      ...(idempotencyKey ? { idempotencyKey } : {}),
    });

    const deletedCart = await Cart.deleteOne({ _id: cart._id, checkoutToken });
    if (!deletedCart.deletedCount) {
      throw new AppError('No se pudo finalizar el carrito', 409, 'CHECKOUT_STATE_CHANGED');
    }
    checkoutClaimed = false;
  } catch (error) {
    if (checkoutClaimed) {
      await Cart.updateOne(
        { _id: cart._id, checkoutToken },
        { $unset: { checkoutToken: 1, checkoutExpiresAt: 1 } },
      );
    }
    for (const item of reserved) {
      await Product.updateOne(
        { _id: item.producto },
        { $inc: { stock: item.cantidad, vendidos: -item.cantidad } }
      );
    }
    if (order?._id) await Order.deleteOne({ _id: order._id });
    return next(error);
  }

  // Genera mensaje WhatsApp formateado
  const whatsappMessage = `
Hola, quiero hacer este pedido:

${validItems.map(i => `• ${i.nombre} x${i.cantidad} - $${(i.precioUnitario * i.cantidad).toLocaleString('es-CO')}`).join('\n')}

Subtotal: $${subtotal.toLocaleString('es-CO')}
Envío: ${costoEnvio === 0 ? 'Gratis' : `$${costoEnvio.toLocaleString('es-CO')}`}
Total: $${total.toLocaleString('es-CO')}

Dirección de envío:
${direccionEnvio.nombreCompleto}
${direccionEnvio.direccion}
${direccionEnvio.ciudad}, ${direccionEnvio.departamento}
Tel: ${direccionEnvio.telefono}

${notas ? `Notas: ${notas}` : ''}

Orden: ${order.numeroOrden}
`.trim();

  // URL WhatsApp con mensaje pre-llenado
  // Usa variable de entorno WHATSAPP_NUMBER
  const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(whatsappMessage)}`;

  res.status(201).json({
    success: true,
    message: 'Pedido creado exitosamente. Serás redirigido a WhatsApp para confirmar.',
    order: {
      id: order._id,
      numeroOrden: order.numeroOrden,
      total: order.total,
      estado: order.estado,
      whatsappUrl,
    },
  });
});

/**
 * GET /api/orders
 * Lista pedidos del usuario autenticado
 * Query: page, limit, estado (filtro opcional)
 */
export const getOrders = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, estado } = req.query;
  const skip = (page - 1) * limit;

  const filter = { usuario: req.userId };
  if (estado) filter.estado = estado;

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })  // Más recientes primero
      .skip(skip)
      .limit(limit)
      .lean({ virtuals: true }),
    Order.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    count: orders.length,
    total,
    page: Number(page),
    pages: Math.ceil(total / limit),
    orders: orders.map(serializeOrder),
  });
});

/**
 * GET /api/orders/:id
 * Detalle de un pedido propio (filtra por usuario)
 */
export const getOrder = asyncHandler(async (req, res, next) => {
  const order = await Order.findOne({ _id: req.params.id, usuario: req.userId }).lean({ virtuals: true });

  if (!order) {
    return next(new AppError('Pedido no encontrado', 404, 'ORDER_NOT_FOUND'));
  }

  res.status(200).json({
    success: true,
    order: serializeOrder(order),
  });
});

/**
 * PATCH /api/orders/:id/cancelar
 * Cancela pedido si está en estado permitido
 * Body opcional: { motivo }
 * Restaura stock y decrementa vendidos
 */
export const cancelOrder = asyncHandler(async (req, res, next) => {
  const order = await Order.findOneAndUpdate(
    { _id: req.params.id, usuario: req.userId, estado: { $in: ['pendiente', 'confirmado'] }, estadoPago: { $ne: 'pagado' } },
    {
      $set: {
        estado: 'cancelado',
        canceladoEn: new Date(),
        motivoCancelacion: req.body.motivo || 'Cancelado por el usuario',
      },
    },
    { new: true }
  );

  if (!order) {
    const existing = await Order.findOne({ _id: req.params.id, usuario: req.userId }).lean();
    if (!existing) return next(new AppError('Pedido no encontrado', 404, 'ORDER_NOT_FOUND'));
    if (existing.estadoPago === 'pagado') {
      return next(new AppError('Un pedido pagado requiere reembolso de administración', 409, 'PAID_ORDER_REQUIRES_REFUND'));
    }
    return next(new AppError('Este pedido no se puede cancelar en su estado actual', 400, 'CANNOT_CANCEL'));
  }

  for (const item of order.items) {
    await Product.updateOne(
      { _id: item.producto },
      { $inc: { stock: item.cantidad, vendidos: -item.cantidad } }
    );
  }

  res.status(200).json({
    success: true,
    message: 'Pedido cancelado correctamente',
    order,
  });
});