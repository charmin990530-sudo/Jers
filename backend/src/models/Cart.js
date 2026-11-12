/** Un carrito por usuario. Guarda snapshots y bloqueos de checkout.
 * Los resúmenes HTTP usan precios vigentes; el pedido conserva su propio precio.
 */
import mongoose from 'mongoose';
import { isMinorAmount } from '../services/money.js';

/**
 * Tope de unidades del MISMO producto en el carrito.
 *
 * Antes el limite de 99 vivia solo en el esquema de cada peticion
 * (`schemas.addToCart` y `schemas.updateCartItem`), o sea que se comprobaba la
 * cantidad de ESA llamada, no la que quedaria en el carrito. Con diez llamadas
 * de `cantidad: 10` el carrito llegaba a 100 unidades del mismo producto y el
 * servidor lo aceptaba: el limite era del cliente, no del servidor.
 *
 * Vive aqui, en el modelo que posee la invariante, para que la validacion de
 * la capa HTTP, el controlador y el propio documento usen el MISMO numero. Si
 * el tope cambiara, se cambia en un sitio.
 */
export const CANTIDAD_MAXIMA_POR_ITEM = 99;

// Subdocumento: Item del carrito con snapshot de precio/nombre/imagen
const cartItemSchema = new mongoose.Schema({
  producto: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  cantidad: {
    type: Number,
    required: true,
    min: [1, 'La cantidad mínima es 1'],
    max: [CANTIDAD_MAXIMA_POR_ITEM, `La cantidad máxima por producto es ${CANTIDAD_MAXIMA_POR_ITEM}`],
    default: 1,
  },
  precioUnitario: {
    type: Number,
    required: true,
    min: [0, 'El precio no puede ser negativo'],
    // Snapshot del precio: si admite decimales, cada subtotal arrastra la
    // imprecision de coma flotante. Ver services/money.js.
    validate: {
      validator: value => value === undefined || isMinorAmount(value),
      message: 'El precio unitario debe ser un numero entero (la moneda no tiene centavos)',
    },
  },
  nombreSnapshot: { type: String, required: true },  // Nombre al momento de agregar
  imagenSnapshot: { type: String },                  // Imagen al momento de agregar
}, { _id: true });

const cartSchema = new mongoose.Schema({
  usuario: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,        // Un solo carrito por usuario
  },
  items: [cartItemSchema],
  checkoutToken: { type: String, select: false },
  checkoutExpiresAt: { type: Date, select: false },
  actualizadoEn: { type: Date, default: Date.now },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Virtual: Total de unidades en carrito
cartSchema.virtual('totalItems').get(function () {
  return this.items.reduce((sum, item) => sum + item.cantidad, 0);
});

// Virtual: Subtotal (precio congelado * cantidad)
cartSchema.virtual('subtotal').get(function () {
  return this.items.reduce((sum, item) => sum + (item.precioUnitario * item.cantidad), 0);
});

// Actualiza timestamp en cada save
cartSchema.pre('save', function (next) {
  this.actualizadoEn = new Date();
  next();
});

export default mongoose.model('Cart', cartSchema);