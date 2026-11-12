import { WHATSAPP_NUMBER } from '../config/env.js';

/** La confirmación y sus reintentos conservan el desglose y el acceso al chat. */
export const createdOrderResponse = order => ({
  id: order._id,
  numeroOrden: order.numeroOrden,
  subtotal: order.subtotal,
  descuento: order.descuento,
  premio: order.premio,
  costoEnvio: order.costoEnvio,
  impuestos: order.impuestos,
  tasaImpuestosBp: order.tasaImpuestosBp,
  total: order.total,
  estado: order.estado,
  whatsappUrl: `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(`Hola, quiero confirmar mi pedido ${order.numeroOrden}.`)}`,
});
