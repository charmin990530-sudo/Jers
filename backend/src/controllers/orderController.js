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
import { Order, Cart, Product } from '../models/index.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { ErrorCodes } from '../middleware/apiError.js';
import { WHATSAPP_NUMBER, SHIPPING_RULES, TAX_RATE_BP } from '../config/env.js';
import { withTransaction, detectTransactionSupport } from '../services/transaction.js';
import { invalidarCacheDashboard } from '../services/dashboardCache.js';
import {
  sendOrderConfirmationEmail,
  sendNewOrderNotificationEmail,
} from '../services/emailService.js';
import {
  multiplyMinorAmount,
  sumMinorAmounts,
  computeOrderTotal,
  shippingCostFor,
  taxFor,
  formatMinorAmount,
} from '../services/money.js';

/**
 * Reglas de envio. Todo en enteros; el umbral es la unidad minima (peso).
 *
 * Reexportado desde `config/env.js` para que quien lo importe no tenga que
 * saber de donde sale. Antes vivia aqui como constante de modulo: cambiar el
 * umbral de envio gratis exigia un redeploy, y el checkout del frontend no
 * tenia forma de conocerlo (mostraba solo el subtotal, y el cliente
 * descubria los $15.000 de envio al final).
 */
export { SHIPPING_RULES } from '../config/env.js';

const serializeOrder = order => ({
  ...order,
  puedeCancelar: ['pendiente', 'confirmado'].includes(order?.estado),
});

/**
 * Respuesta de "este pedido ya existe" (reintento con la misma clave).
 *
 * La clave de idempotencia tiene que devolver SIEMPRE el mismo pedido, y con
 * los mismos datos. Se construye aqui para que el camino normal y el camino
 * de carrera(devolviendo el pedido que creo otra peticion) no puedan divergir.
 */
const respuestaPedidoExistente = order => ({
  success: true,
  message: 'El pedido ya había sido creado',
  order: {
    id: order._id,
    numeroOrden: order.numeroOrden,
    total: order.total,
    estado: order.estado,
    whatsappUrl: null,
  },
});

/**
 * Busca el pedido de un usuario con una clave de idempotencia concreta.
 * @param {import('mongoose').Types.ObjectId} usuario
 * @param {string} idempotencyKey
 * @returns {Promise<object|null>}
 */
const buscarPedidoPorClave = (usuario, idempotencyKey) =>
  Order.findOne({ usuario, idempotencyKey }).select('+idempotencyKey');

/**
 * Busca el pedido esperando un poco entre intentos.
 *
 * POR QUE HAY QUE ESPERAR
 * ----------------------
 * Cuando dos peticiones con la MISMA clave llegan a la vez, la segunda puede
 * perder la carrera por el carrito (el `checkoutToken`) y fallar con
 * `CHECKOUT_IN_PROGRESS` JUSTO cuando la primera todavia no ha confirmado su
 * pedido. Si la segunda consulta el pedido en ese instante, no lo encuentra y
 * le responde 409 al cliente: el cliente ve un error aunque su pedido SI se
 * haya creado, que es justo lo que la idempotencia debe evitar.
 *
 * Se reintenta unas pocas veces con esperas cortas: si la primera peticion
 *.commit() o no commit() falla, el pedido no existira nunca y se devuelve el
 * error original tras el ultimo intento.
 */
const buscarPedidoPorClaveConEspera = async (usuario, idempotencyKey, intentos = 4) => {
  for (let i = 0; i < intentos; i++) {
    const order = await buscarPedidoPorClave(usuario, idempotencyKey);
    if (order) return order;
    if (i < intentos - 1) {
      await new Promise(resolve => setTimeout(resolve, 60 * (i + 1)));
    }
  }
  return null;
};

/**
 * Reserva el stock de las lineas del pedido.
 *
 * CON transaccion (replica set): un unico `bulkWrite`. La transaccion garantiza
 * que se aplica todo o nada, asi que no hace falta saber que lineas se
 * aplicaron: si algo falla, el abort lo revierte entero. Un solo viaje de red
 * para N lineas.
 *
 * SIN transaccion (mongod standalone): el `bulkWrite` puede aplicar las tres
 * primeras operaciones y NO aplicar la cuarta (su filtro no matchea porque ya
 * no hay stock) sin lanzar ningun error. La compensacion necesita saber QUE se
 * aplico para devolver SOLO ese stock: devolver el de una linea que nunca se
 * desconto inflaria el inventario, y el stock fantasma permitia vender mas
 * producto del que existia. Por eso, en este camino, la reserva se hace de una
 * en una y se va anotando lo que se aplico de verdad.
 *
 * @param {Array<object>} items - Lineas validas del pedido.
 * @param {import('mongodb').ClientSession|null} session
 * @returns {Promise<{completos: number, aplicados: Array<object>}>}
 */
const reservarStock = async (items, session) => {
  if (session) {
    const reservation = await Product.bulkWrite(
      items.map(item => ({
        updateOne: {
          filter: { _id: item.producto, activo: true, stock: { $gte: item.cantidad } },
          update: { $inc: { stock: -item.cantidad, vendidos: item.cantidad } },
        },
      })),
      { session, ordered: true },
    );
    return { completos: reservation.modifiedCount ?? 0, aplicados: items };
  }

  const aplicados = [];
  for (const item of items) {
    const resultado = await Product.updateOne(
      { _id: item.producto, activo: true, stock: { $gte: item.cantidad } },
      { $inc: { stock: -item.cantidad, vendidos: item.cantidad } },
    );
    if ((resultado.modifiedCount ?? 0) === 1) aplicados.push(item);
  }
  return { completos: aplicados.length, aplicados };
};

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
    return next(new AppError('Idempotency-Key inválida', 400, ErrorCodes.INVALID_IDEMPOTENCY_KEY));
  }
  if (idempotencyKey) {
    const existingOrder = await buscarPedidoPorClave(req.userId, idempotencyKey);
    if (existingOrder) {
      return res.status(200).json(respuestaPedidoExistente(existingOrder));
    }
  }

  // Obtiene carrito con productos poblados
  const cart = await Cart.findOne({ usuario: req.userId })
    .populate('items.producto');

  if (!cart || cart.items.length === 0) {
    return next(new AppError('El carrito está vacío', 400, ErrorCodes.EMPTY_CART));
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
      return next(new AppError(`El producto ${item.nombreSnapshot} ya no está disponible`, 400, ErrorCodes.PRODUCT_UNAVAILABLE));
    }
    if (producto.stock < item.cantidad) {
      return next(new AppError(`Stock insuficiente para ${producto.nombre}. Disponible: ${producto.stock}`, 400, ErrorCodes.INSUFFICIENT_STOCK));
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
  // Los precios del catálogo son sin impuestos. El IVA se suma aqui, en el
  // servidor, sobre la base imponible (subtotal + envio) y con la tasa vigente
  // en el momento del pedido. El cliente nunca envía importes: el esquema Zod
  // solo acepta `direccionEnvio` y `notas`.
  const impuestos = taxFor(subtotal + costoEnvio, TAX_RATE_BP);
  const total = computeOrderTotal({ subtotal, shipping: costoEnvio, tax: impuestos });

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
  // Id del pedido que llegara a crearse. La compensacion del catch solo puede
  // borrar ESTE documento. Antes se borraba por
  // `{usuario, idempotencyKey: idempotencyKey || null}` y Mongo trata
  // `{campo: null}` como "el campo es null O no existe", asi que cuando el
  // cliente no manda Idempotency-Key (que es lo normal) el filtro matcheaba
  // TODOS los pedidos previos del usuario y los borraba. Con dos POST
  // simultaneos sin cabecera, el que recibia el 409 se llevaba por delante el
  // historial entero de compras.
  let createdOrderId = null;
  // Lineas cuyo stock se desconto DE VERDAD. Sin replica set no hay atomicidad,
  // asi que la compensacion tiene que saber exactamente cuales se aplicaron:
  // devolver el stock de una linea que nunca se desconto lo inflaria, y el
  // stock fantasma permitia vender mas producto del que existia.
  let itemsReservados = [];
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

      // 2) Reservar stock. Cada operacion conserva su filtro
      //    `stock: {$gte: cantidad}`, asi que si otro pedido se adelanta ese
      //    update no modifica nada y se refleja en el conteo de aplicados.
      //    Con transaccion va en un solo bulkWrite (un viaje de red); sin ella
      //    se hace linea a linea para saber QUE se desconto, que es lo que
      //    necesita la compensacion. Ver reservarStock().
      const { completos, aplicados } = await reservarStock(validItems, session);
      itemsReservados = aplicados;
      if (completos !== validItems.length) {
        throw new AppError('Stock insuficiente para uno o más productos del carrito', 400, ErrorCodes.INSUFFICIENT_STOCK);
      }

      // 3) Crear el pedido con el snapshot de precios ya calculado.
      const [created] = await Order.create([{
        usuario: req.userId,
        items: validItems,
        subtotal,
        costoEnvio,
        impuestos,
        tasaImpuestosBp: TAX_RATE_BP,
        total,
        direccionEnvio,
        notas,
        metodoPago: 'whatsapp',
        ...(idempotencyKey ? { idempotencyKey } : {}),
      }], { session });
      createdOrderId = created._id;

      // 4) Consumir el carrito. Si el borrado no ocurre, el pedido no sirve.
      const deletedCart = await Cart.deleteOne({ _id: cart._id, checkoutToken }, { session });
      if (!deletedCart.deletedCount) {
        throw new AppError('No se pudo finalizar el carrito', 409, ErrorCodes.CHECKOUT_STATE_CHANGED);
      }

      return created;
    });
    order = outcome.result;
  } catch (error) {
    // Con replica set el abort ya revIRTIO todo y compensar aqui seria
    // DESHACER un cambio ya deshecho, introduciendo stock fantasma. Por eso la
    // compensacion solo corre cuando no hubo transaccion real.
    if (!transactional) {
      await Promise.allSettled([
        // Solo las lineas que se descontaron de verdad. Antes se devolvia el
        // stock de TODAS las lineas del carrito, incluso de las que nunca se
        // habían descontado (por ejemplo cuando el fallo era pedir el carrito
        // que ya tenia otro checkout, o cuando el stock se habia agotado en
        // otra linea): cada intento fallido inflaba el inventario.
        itemsReservados.length
          ? Product.bulkWrite(itemsReservados.map(item => ({
            updateOne: {
              filter: { _id: item.producto, stock: { $gte: 0 } },
              update: { $inc: { stock: item.cantidad, vendidos: -item.cantidad } },
            },
          })), { ordered: false })
          : Promise.resolve({ modifiedCount: 0 }),
        Cart.updateOne(
          { _id: cart._id, checkoutToken },
          { $unset: { checkoutToken: 1, checkoutExpiresAt: 1 } },
        ),
        // Solo el pedido de ESTE intento. Si no llego a crearse (por ejemplo
        // porque el stock se agoto en el paso 2), no hay nada que borrar y el
        // `createdOrderId === null` lo omite.
        createdOrderId
          ? Order.deleteOne({ _id: createdOrderId })
          : Promise.resolve({ deletedCount: 0 }),
      ]);
    }

    // IDEMPOTENCIA BAJO CONCURRENCIA
    // --------------------------------
    // Esta peticion ha fallado, pero puede que OTRA peticion con la misma clave
    // de idempotencia haya creado el pedido (el caso tipico: dos clics o dos
    // pestanas, la segunda pierde la carrera por el carrito con
    // CHECKOUT_IN_PROGRESS). El cliente debe recibir SU pedido, no un error.
    //
    // Si el pedido aparece, se devuelve tal cual (200). Si no aparece, el error
    // original se propaga: la peticion no creo nada y el cliente tiene que
    // enterarse.
    if (idempotencyKey) {
      const yaCreado = await buscarPedidoPorClaveConEspera(req.userId, idempotencyKey);
      if (yaCreado) {
        return res.status(200).json(respuestaPedidoExistente(yaCreado));
      }
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
IVA (${(TAX_RATE_BP / 100).toFixed(TAX_RATE_BP % 100 === 0 ? 0 : 2)}%): ${formatMinorAmount(impuestos)}
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
    impuestos,
    tasaImpuestosBp: TAX_RATE_BP,
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

  // Un pedido nuevo cambia totalOrders/totalRevenue: invalidar la caché del
  // dashboard para que el panel admin lo refleje en la siguiente lectura.
  invalidarCacheDashboard();

  res.status(201).json({
    success: true,
    // El mensaje tiene que decir la verdad. Decía "Serás redirigido a WhatsApp
    // para confirmar" y el frontend no redirige nunca (muestra un enlace), así
    // que el cliente leía que el pago ya estaba en camino cuando en realidad
    // faltaba el paso que confirma la venta.
    message: 'Pedido creado. Falta confirmar el pago con la tienda por WhatsApp.',
    order: {
      id: order._id,
      numeroOrden: order.numeroOrden,
      subtotal,
      costoEnvio,
      impuestos,
      tasaImpuestosBp: TAX_RATE_BP,
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
    return next(new AppError('Pedido no encontrado', 404, ErrorCodes.ORDER_NOT_FOUND));
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
  // Estado que tenia el pedido ANTES de la cancelacion. El catch lo necesita
  // para deshacer: el filtro de arriba admite 'pendiente' y 'confirmado', y
  // devolver siempre a 'pendiente' degradaba un pedido ya confirmado por la
  // tienda. El admin si lo hacia bien (`adminController.js`), aqui no.
  let estadoPrevio = null;

  try {
    const outcome = await withTransaction(async ({ session }) => {
      const actual = await Order.findOne(
        { _id: req.params.id, usuario: req.userId },
        { estado: 1 }
      ).session(session).lean();
      if (actual) estadoPrevio = actual.estado;

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
      // Si no hay estado previo no se sabe a que estado volver: es preferible
      // dejar constancia del cancelado a adivinar. No deberia ocurrir (el
      // documento existe si `motivoAplicado` es true).
      if (pending && estadoPrevio) {
        await Promise.allSettled([
          Product.bulkWrite(pending.items.map(item => ({
            updateOne: {
              filter: { _id: item.producto },
              update: { $inc: { stock: -item.cantidad, vendidos: item.cantidad } },
            },
          })), { ordered: false }),
          Order.updateOne(
            { _id: req.params.id },
            { $set: { estado: estadoPrevio }, $unset: { canceladoEn: 1, motivoCancelacion: 1 } },
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
    return next(new AppError('Este pedido no se puede cancelar en su estado actual', 400, ErrorCodes.CANNOT_CANCEL));
  }

  // Cancelar un pedido cambia totalOrders/estados/revenue: invalidar la caché
  // del dashboard para que el panel admin lo refleje en la siguiente lectura.
  invalidarCacheDashboard();

  res.status(200).json({
    success: true,
    message: 'Pedido cancelado correctamente',
    order,
  });
});