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
import { ErrorCodes } from '../middleware/apiError.js';
import { WHATSAPP_NUMBER } from '../config/env.js';
import { withTransaction, detectTransactionSupport } from '../services/transaction.js';
import {
  sendOrderConfirmationEmail,
  sendNewOrderNotificationEmail,
} from '../services/emailService.js';
import {
  multiplyMinorAmount,
  sumMinorAmounts,
  computeOrderTotal,
  shippingCostFor,
  formatMinorAmount,
} from '../services/money.js';

/** Reglas de envio. Todo en enteros; el umbral es la unidad minima (peso). */
export const SHIPPING_RULES = Object.freeze({ freeFrom: 200000, cost: 15000 });

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

  // ==============================================================
  // VALIDACION DEL CARRITO Y CALCULO DEL IMPORTE
  // ==============================================================
  // Toda la aritmetica pasa por services/money.js: los importes son enteros y
  // ninguna suma usa coma flotante. `subtotal` se obtiene sumando subtotales de
  // linea ya multiplicados con control de rango.
  const validItems = [];
  const itemSubtotals = [];

  for (const item of cart.items) {
    const producto = item.producto;
    if (!producto || !producto.activo) {
      return next(new AppError(`El producto ${item.nombreSnapshot} ya no está disponible`, 400, 'PRODUCT_UNAVAILABLE'));
    }
    if (producto.stock < item.cantidad) {
      return next(new AppError(`Stock insuficiente para ${producto.nombre}. Disponible: ${producto.stock}`, 400, 'INSUFFICIENT_STOCK'));
    }

    // Snapshot con el PRECIO ACTUAL (puede haber cambiado desde que se agrego).
    const lineSubtotal = multiplyMinorAmount(producto.precio, item.cantidad, 'subtotal');
    validItems.push({
      producto: producto._id,
      nombre: producto.nombre,
      imagen: producto.imagenPrincipal,
      precioUnitario: producto.precio,
      cantidad: item.cantidad,
      subtotal: lineSubtotal,
    });
    itemSubtotals.push(lineSubtotal);
  }

  const subtotal = sumMinorAmounts(itemSubtotals, 'subtotal');
  const costoEnvio = shippingCostFor(subtotal, SHIPPING_RULES);
  const total = computeOrderTotal({ subtotal, shipping: costoEnvio, discount: 0 });

  // ==============================================================
  // SECCION TRANSACCIONAL
  // ==============================================================
  // Desde aqui se mueven stock, se crea el pedido y se consume el carrito.
  //
  // CON REPLICA SET (lo recomendado y lo que usan los tests): las tres cosas
  // ocurren dentro de una transaccion, o se aplican todas o ninguna. No puede
  // quedar un pedido sin stock descontado, ni stock descontado sin pedido, ni un
  // carrito vaciado sin pedido creado.
  //
  // SIN REPLICA SET (mongod standalone): el servidor rechaza las transacciones
  // con "Transaction numbers are only allowed on a replica set member or mongos".
  // En ese caso `withTransaction` ejecuta el callback sin sesion y lo avisa por
  // log. La coherencia la entonces garantiza la compensacion explicita del
  // catch, que es el comportamiento que tenia el proyecto antes. Es
  // "atomicidad logica", no ACID: para ACID hay que arrancar mongod con
  // --replSet. El codigo es el mismo en los dos caminos, no dos implementaciones.
  const checkoutToken = randomUUID();
  const checkoutExpiresAt = new Date(Date.now() + 2 * 60 * 1000);

  // Se consulta ANTES de escribir para poder compensar solo si hace falta y para
  // no reservar stock a un pedido que ya se sabe que va a fallar.
  const transactional = await detectTransactionSupport();

  let order;
  try {
    const outcome = await withTransaction(async ({ session }) => {
      // 1) Tomar el carrito. El $or descarta un checkout vivo de otro intento, de
      //    modo que dos clics simultaneos no puedan pasar los dos.
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
        { new: true, session },
      );
      if (!claimedCart) {
        throw new AppError('Ya hay un checkout en curso para este carrito', 409, ErrorCodes.CHECKOUT_IN_PROGRESS);
      }

      // 2) Reservar stock con UN solo bulkWrite. Antes era un updateOne por item
      //    (N viajes de red); con 20 items en el carrito un corte de conexion a
      //    mitad dejaba el stock descontado a medias. Cada operacion conserva su
      //    filtro `stock: {$gte: cantidad}`, asi que si otro pedido se adelanta
      //    ese update no modifica nada y bulkWrite lo refleja en modifiedCount.
      const reservation = await Product.bulkWrite(
        validItems.map(item => ({
          updateOne: {
            filter: { _id: item.producto, activo: true, stock: { $gte: item.cantidad } },
            update: { $inc: { stock: -item.cantidad, vendidos: item.cantidad } },
          },
        })),
        { session, ordered: true },
      );
      const reservedCount = reservation.modifiedCount ?? 0;
      if (reservedCount !== validItems.length) {
        throw new AppError('Stock insuficiente para uno o más productos del carrito', 400, 'INSUFFICIENT_STOCK');
      }

      // 3) Crear el pedido con el snapshot de precios ya calculado.
      const [created] = await Order.create([{
        usuario: req.userId,
        items: validItems,
        subtotal,
        costoEnvio,
        total,
        direccionEnvio,
        notas,
        metodoPago: 'whatsapp',
        ...(idempotencyKey ? { idempotencyKey } : {}),
      }], { session });

      // 4) Consumir el carrito. Si el borrado no ocurre, el pedido no sirve.
      const deletedCart = await Cart.deleteOne({ _id: cart._id, checkoutToken }, { session });
      if (!deletedCart.deletedCount) {
        throw new AppError('No se pudo finalizar el carrito', 409, ErrorCodes.CHECKOUT_STATE_CHANGED);
      }

      return created;
    });
    order = outcome.result;
  } catch (error) {
    // Con replica set el abort ya revirtió todo y compensar aqui seria
    // DESHACER un cambio ya deshecho, introduciendo stock fantasma. Por eso la
    // compensacion solo corre cuando no hubo transaccion real.
    if (!transactional) {
      await Promise.allSettled([
        Product.bulkWrite(validItems.map(item => ({
          updateOne: {
            filter: { _id: item.producto, stock: { $gte: 0 } },
            update: { $inc: { stock: item.cantidad, vendidos: -item.cantidad } },
          },
        })), { ordered: false }),
        Cart.updateOne(
          { _id: cart._id, checkoutToken },
          { $unset: { checkoutToken: 1, checkoutExpiresAt: 1 } },
        ),
        Order.deleteMany({ usuario: req.userId, idempotencyKey: idempotencyKey || null }),
      ]);
    }
    throw error;
  }

  // Genera mensaje WhatsApp formateado. Los importes salen de los valores ya
  // redondeados de la linea, no de una multiplicacion nueva, para que el texto
  // que ve el cliente coincida exactamente con lo que se guardo.
  const whatsappMessage = `
Hola, quiero hacer este pedido:

${validItems.map(i => `• ${i.nombre} x${i.cantidad} - ${formatMinorAmount(i.subtotal)}`).join('\n')}

Subtotal: ${formatMinorAmount(subtotal)}
Envío: ${costoEnvio === 0 ? 'Gratis' : formatMinorAmount(costoEnvio)}
Total: ${formatMinorAmount(total)}

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

  // ==============================================================
  // AVISOS POR CORREO
  // ==============================================================
  // El cobro se cierra por WhatsApp, asi que este es el UNICO canal automatico
  // que confirma la compra. Sin el, un cliente que cierra la pestaña del chat
  // deja el pedido en `pendiente` con el stock ya descontado y sin que nadie lo
  // sepa. Se avisa a las dos partes: al cliente (confirmacion) y al negocio
  // (pedido nuevo), que es quien debe perseguir el pago.
  //
  // Va DESPUES de la transaccion y sin `await`: el pedido ya esta confirmado y
  // en la base de datos, y un SMTP caido no debe tumbar el checkout ni dejar al
  // cliente sin ver el numero de pedido. `sendEmail` es ademas un no-op cuando
  // no hay SMTP_HOST configurado, de modo que en desarrollo y en tests no hace
  // nada. Los importes son los mismos que se guardaron, no se recalcula nada.
  const cliente = req.user;
  const datosCorreo = {
    numeroOrden: order.numeroOrden,
    nombre: [cliente?.nombre, cliente?.apellido].filter(Boolean).join(' '),
    email: cliente?.email,
    telefono: cliente?.telefono,
    items: validItems,
    subtotal,
    costoEnvio,
    total,
    direccionEnvio,
    notas,
  };

  Promise.allSettled([
    cliente?.email
      ? sendOrderConfirmationEmail({ ...datosCorreo, to: cliente.email })
      : Promise.resolve({ sent: false }),
    sendNewOrderNotificationEmail(datosCorreo),
  ]).then(results => {
    results.forEach((resultado, indice) => {
      if (resultado.status === 'rejected') {
        console.error(`No se pudo enviar el correo de pedido ${order.numeroOrden} (aviso ${indice + 1}):`, resultado.reason?.message || resultado.reason);
      }
    });
  });

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
 *
 * Restaurar el stock y marcar el pedido como cancelado es una operacion de
 * saldo: si el estado cambiara y el stock no, la tienda pierde inventario (o lo
 * duplica). Por eso el cambio de estado y la devolucion de stock van juntos, en
 * transaccion cuando el despliegue la admite.
 *
 * `usuario: req.userId` viaja en el filtro: por construccion no se puede cancelar
 * el pedido de otra persona. Si el ID pertenece a otro usuario la consulta no lo
 * encuentra y responde 404, no 403, para no confirmar que ese pedido existe.
 */
export const cancelOrder = asyncHandler(async (req, res, next) => {
  const transactional = await detectTransactionSupport();
  let order;
  let motivoAplicado = false;

  try {
    const outcome = await withTransaction(async ({ session }) => {
      const cancelled = await Order.findOneAndUpdate(
        {
          _id: req.params.id,
          usuario: req.userId,
          estado: { $in: ['pendiente', 'confirmado'] },
          estadoPago: { $ne: 'pagado' },
        },
        {
          $set: {
            estado: 'cancelado',
            canceladoEn: new Date(),
            motivoCancelacion: req.body.motivo || 'Cancelado por el usuario',
          },
        },
        { new: true, session }
      );

      if (cancelled) {
        motivoAplicado = true;
        // UN bulkWrite en vez de un updateOne por item (antes N viajes de red).
        await Product.bulkWrite(
          cancelled.items.map(item => ({
            updateOne: {
              filter: { _id: item.producto },
              update: { $inc: { stock: item.cantidad, vendidos: -item.cantidad } },
            },
          })),
          { session, ordered: false },
        );
      }

      return cancelled;
    });
    order = outcome.result;
  } catch (error) {
    // Solo sin transaccion real: con replica set el abort ya lo revierte.
    if (!transactional && motivoAplicado) {
      const pending = await Order.findOne({ _id: req.params.id, usuario: req.userId, estado: 'cancelado' }).lean();
      if (pending) {
        await Promise.allSettled([
          Product.bulkWrite(pending.items.map(item => ({
            updateOne: {
              filter: { _id: item.producto },
              update: { $inc: { stock: -item.cantidad, vendidos: item.cantidad } },
            },
          })), { ordered: false }),
          Order.updateOne(
            { _id: req.params.id },
            { $set: { estado: 'pendiente' }, $unset: { canceladoEn: 1, motivoCancelacion: 1 } },
          ),
        ]);
      }
    }
    throw error;
  }

  if (!order) {
    const existing = await Order.findOne({ _id: req.params.id, usuario: req.userId }).lean();
    if (!existing) return next(new AppError('Pedido no encontrado', 404, ErrorCodes.ORDER_NOT_FOUND));
    if (existing.estadoPago === 'pagado') {
      return next(new AppError('Un pedido pagado requiere reembolso de administración', 409, ErrorCodes.PAID_ORDER_REQUIRES_REFUND));
    }
    return next(new AppError('Este pedido no se puede cancelar en su estado actual', 400, 'CANNOT_CANCEL'));
  }

  res.status(200).json({
    success: true,
    message: 'Pedido cancelado correctamente',
    order,
  });
});