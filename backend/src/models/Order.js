/**
 * Order.js - Modelo de Pedido/Orden
 * 
 * FLUJO DE ESTADOS:
 * estado:          pendiente → confirmado → procesando → enviado → entregado
 *                     ↓              ↓
 *                  cancelado     reembolsado
 * 
 * estadoPago:      pendiente → pagado
 *                     ↓
 *                  fallido / reembolsado
 * 
 * CAMPOS PRINCIPALES:
 * - usuario: ref User
 * - numeroOrden: único, auto-generado (ej: BJ-260922-A1B2C3)
 * - items: snapshot completo (producto, nombre, imagen, precio, cantidad, subtotal)
 * - subtotal: suma items
 * - costoEnvio: 0 si subtotal >= 200k, sino 15k (lógica en controller)
 * - descuento: para cupones futuros
 * - total: subtotal + envio - descuento
 * - estado: tracking logístico (7 estados)
 * - estadoPago: tracking financiero (4 estados)
 * - metodoPago: 'whatsapp' | 'transferencia' | 'efectivo' | 'tarjeta'
 * - direccionEnvio: snapshot embebido (no ref, para histórico inmutable)
 * - notas: observaciones del cliente
 * - whatsappEnviado: flag si ya se abrió WhatsApp
 * - fechaEnvio/Entrega/Cancelado: timestamps de hitos
 * - motivoCancelacion: texto libre
 * 
 * MIDDLEWARES:
 * - pre('validate'): auto-genera numeroOrden si no existe
 *   Formato: BJ-YYMMDD-RANDOM (ej: BJ-260922-A1B2C3)
 * 
 * VIRTUALES:
 * - puedeCancelar: true si estado en ['pendiente', 'confirmado']
 * 
 * ÍNDICES:
 * - usuario + createdAt desc: listar pedidos de usuario
 * - estado: filtrar por estado (admin dashboard)
 */
import mongoose from 'mongoose';
import { isMinorAmount } from '../services/money.js';

/**
 * Exige un importe entero. `min: 0` solo no alcanza: Mongoose acepta 15000.5
 * porque es un Number valido, y esos centavos sueltos se acumulan hasta el total
 * que se cobra. Ver services/money.js.
 */
const minorAmount = (label) => ({
  validate: {
    validator: value => value === undefined || isMinorAmount(value),
    message: `${label} debe ser un numero entero (la moneda no tiene centavos)`,
  },
});

// Subdocumento: Item de orden (snapshot inmutable al momento de comprar)
const orderItemSchema = new mongoose.Schema({
  producto: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  nombre: { type: String, required: true },        // Nombre congelado
  imagen: { type: String },                        // Imagen congelada
  precioUnitario: { type: Number, required: true, min: 0, ...minorAmount('El precio unitario') },
  cantidad: { type: Number, required: true, min: 1 },
  subtotal: { type: Number, required: true, min: 0, ...minorAmount('El subtotal de la linea') },
}, { _id: true });

// Subdocumento: Dirección de envío embebida (no referencia, para histórico)
const shippingAddressSchema = new mongoose.Schema({
  alias: { type: String, required: true },
  nombreCompleto: { type: String, required: true },
  telefono: { type: String, required: true },
  direccion: { type: String, required: true },
  ciudad: { type: String, required: true },
  departamento: { type: String, required: true },
  codigoPostal: { type: String },
}, { _id: false });  // _id: false = no genera ObjectId para subdocumento

const orderSchema = new mongoose.Schema({
  usuario: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  idempotencyKey: { type: String, select: false },
  numeroOrden: {
    type: String,
    unique: true,
    required: true,
  },
  items: [orderItemSchema],
  subtotal: { type: Number, required: true, min: 0, ...minorAmount('El subtotal') },
  costoEnvio: { type: Number, default: 0, min: 0, ...minorAmount('El costo de envio') },
  descuento: { type: Number, default: 0, min: 0, ...minorAmount('El descuento') },
  total: { type: Number, required: true, min: 0, ...minorAmount('El total') },
  estado: {
    type: String,
    enum: [
      'pendiente',      // Recién creado, esperando confirmación
      'confirmado',     // Confirmado por admin/tienda
      'procesando',     // Preparando paquete
      'enviado',        // En tránsito (courier)
      'entregado',      // Entregado al cliente
      'cancelado',      // Cancelado (antes de enviar)
      'reembolsado',    // Devuelto + dinero
    ],
    default: 'pendiente',
  },
  estadoPago: {
    type: String,
    enum: ['pendiente', 'pagado', 'fallido', 'reembolsado'],
    default: 'pendiente',
  },
  metodoPago: {
    type: String,
    enum: ['whatsapp', 'transferencia', 'efectivo', 'tarjeta'],
    default: 'whatsapp',
  },
  direccionEnvio: { type: shippingAddressSchema, required: true },
  notas: { type: String, maxlength: [500, 'Las notas no pueden exceder 500 caracteres'] },
  whatsappEnviado: { type: Boolean, default: false },
  fechaEnvio: { type: Date },
  fechaEntrega: { type: Date },
  canceladoEn: { type: Date },
  motivoCancelacion: { type: String },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

/**
 * Genera el numero de pedido: BJ-YYMMDD-RANDOM (ej: BJ-260131-K7F2Q9).
 *
 * Se exporta como funcion pura para poder verificarla con fechas concretas
 * (fin de mes, cambio de ano, ...) sin tener que falsear el reloj global. El
 * hook la llama con `new Date()`, que es el unico lugar donde aparece el "ahora".
 *
 * Los dos digitos de mes y dia se rellenan con ceros a la izquierda, de modo que
 * el 1 de enero es "260101" y el 31 de enero "260131": ambos tienen la misma
 * longitud y el numero siempre ocupa 6 digitos de fecha. El sufijo aleatorio de 6
 * caracteres evita el choque dentro del mismo dia.
 *
 * @param {Date} [fecha=new Date()]
 * @returns {string}
 */
export const generarNumeroOrden = (fecha = new Date()) => {
  const anio = String(fecha.getFullYear()).slice(-2);
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  const aleatorio = Math.random().toString(36).substring(2, 8).toUpperCase().padEnd(6, '0').slice(0, 6);
  return `BJ-${anio}${mes}${dia}-${aleatorio}`;
};

// Auto-genera número de orden único antes de validar
orderSchema.pre('validate', function (next) {
  if (!this.numeroOrden) this.numeroOrden = generarNumeroOrden();
  next();
});

// Virtual: ¿Se puede cancelar? Solo en estados iniciales
orderSchema.virtual('puedeCancelar').get(function () {
  return ['pendiente', 'confirmado'].includes(this.estado);
});

// Índices para queries comunes
orderSchema.index({ usuario: 1, createdAt: -1 }); // Mis pedidos (más recientes primero)
// Listado del panel de admin: filtra por estado opcionalmente y SIEMPRE ordena por
// createdAt descendente. Sin este indice Mongo hace un COLLSCAN + sort en memoria
// de toda la coleccion cada vez que se abre el panel.
orderSchema.index({ estado: 1, createdAt: -1 });
// Dashboard: agrega los pedidos pagados. Cubre el $match de totalRevenue.
// Cubre tambien revenueToday porque createdAt va detras de estadoPago.
orderSchema.index({ estadoPago: 1, createdAt: -1 });
// Idempotencia: UNICHE solo entre pedidos que TRAEN clave.
//
// `sparse: true` no sirve aquí. En un índice compuesto, sparse omite el
// documento únicamente si TODOS los campos del índice faltan; como `usuario`
// siempre está, un pedido sin `Idempotency-Key` se indexaba igual con
// `idempotencyKey: null` y el SEGUNDO pedido del mismo usuario sin cabecera
// chocaba con duplicate key (11000) devolviendo un confuso "El recurso ya
// existe". Un índice partial excluye del índice los documentos sin clave.
orderSchema.index(
  { usuario: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: 'string' } },
  },
);
orderSchema.index({ estado: 1 });                 // Admin: filtrar por estado

export default mongoose.model('Order', orderSchema);