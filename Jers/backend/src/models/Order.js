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

// Subdocumento: Item de orden (snapshot inmutable al momento de comprar)
const orderItemSchema = new mongoose.Schema({
  producto: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  nombre: { type: String, required: true },        // Nombre congelado
  imagen: { type: String },                        // Imagen congelada
  precioUnitario: { type: Number, required: true, min: 0 },
  cantidad: { type: Number, required: true, min: 1 },
  subtotal: { type: Number, required: true, min: 0 }, // precio * cantidad
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
  subtotal: { type: Number, required: true, min: 0 },
  costoEnvio: { type: Number, default: 0, min: 0 },
  descuento: { type: Number, default: 0, min: 0 },
  total: { type: Number, required: true, min: 0 },
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

// Auto-genera número de orden único antes de validar
// Formato: BJ-YYMMDD-RANDOM (ej: BJ-260922-A1B2C3)
orderSchema.pre('validate', function (next) {
  if (!this.numeroOrden) {
    const fecha = new Date();
    const año = fecha.getFullYear().toString().slice(-2);
    const mes = (fecha.getMonth() + 1).toString().padStart(2, '0');
    const dia = fecha.getDate().toString().padStart(2, '0');
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    this.numeroOrden = `BJ-${año}${mes}${dia}-${random}`;
  }
  next();
});

// Virtual: ¿Se puede cancelar? Solo en estados iniciales
orderSchema.virtual('puedeCancelar').get(function () {
  return ['pendiente', 'confirmado'].includes(this.estado);
});

// Índices para queries comunes
orderSchema.index({ usuario: 1, createdAt: -1 }); // Mis pedidos (más recientes primero)
orderSchema.index({ usuario: 1, idempotencyKey: 1 }, { unique: true, sparse: true });
orderSchema.index({ estado: 1 });                 // Admin: filtrar por estado

export default mongoose.model('Order', orderSchema);