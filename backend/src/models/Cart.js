/**
 * Cart.js - Modelo de Carrito de Compras
 * 
 * DISEÑO: Un carrito por usuario (unique: true en usuario)
 * 
 * CAMPOS:
 * - usuario: ref User (único, un carrito por user)
 * - items: array de subdocumentos cartItemSchema
 * - actualizadoEn: timestamp última modificación
 * 
 * SUBDOCUMENTO cartItemSchema:
 * - producto: ref Product
 * - cantidad: min 1
 * - precioUnitario: PRECIO CONGELADO al momento de agregar (snapshot)
 * - nombreSnapshot: nombre del producto al agregar
 * - imagenSnapshot: imagen principal al agregar
 * 
 * VIRTUALES:
 * - totalItems: suma de cantidades
 * - subtotal: suma(precioUnitario * cantidad)
 * 
 * MÉTODOS DE INSTANCIA:
 * - agregarItem(producto, cantidad): suma si existe, crea si no
 * - actualizarCantidad(productoId, cantidad): cambia cantidad o elimina si <1
 * - eliminarItem(productoId): quita producto del carrito
 * - limpiar(): vacía todo el carrito
 * 
 * NOTA IMPORTANTE: precioUnitario es snapshot para que no cambie
 * si el admin modifica el precio del producto mientras está en carrito
 */
import mongoose from 'mongoose';

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
    default: 1,
  },
  precioUnitario: {
    type: Number,
    required: true,
    min: [0, 'El precio no puede ser negativo'],
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

/**
 * Agrega producto al carrito o incrementa cantidad si ya existe
 * @param {Object} producto - Documento Product (requiere _id, precio, nombre, imagenPrincipal)
 * @param {Number} cantidad - Cantidad a agregar (default 1)
 * @returns {Promise<Cart>} Carrito actualizado
 */
cartSchema.methods.agregarItem = function (producto, cantidad = 1) {
  const itemExistente = this.items.find(
    item => item.producto.toString() === producto._id.toString()
  );

  if (itemExistente) {
    itemExistente.cantidad += cantidad;
  } else {
    this.items.push({
      producto: producto._id,
      cantidad,
      precioUnitario: producto.precio,          // Snapshot: precio actual
      nombreSnapshot: producto.nombre,          // Snapshot: nombre actual
      imagenSnapshot: producto.imagenPrincipal, // Snapshot: imagen actual
    });
  }
  return this.save();
};

/**
 * Actualiza cantidad de un item (elimina si cantidad < 1)
 * @param {String|ObjectId} productoId
 * @param {Number} cantidad
 * @returns {Promise<Cart>}
 * @throws Error si producto no está en carrito
 */
cartSchema.methods.actualizarCantidad = function (productoId, cantidad) {
  const item = this.items.find(item => item.producto.toString() === productoId.toString());
  if (!item) throw new Error('Producto no encontrado en el carrito');
  if (cantidad < 1) {
    this.items = this.items.filter(item => item.producto.toString() !== productoId.toString());
  } else {
    item.cantidad = cantidad;
  }
  return this.save();
};

/**
 * Elimina un producto completamente del carrito
 * @param {String|ObjectId} productoId
 * @returns {Promise<Cart>}
 */
cartSchema.methods.eliminarItem = function (productoId) {
  this.items = this.items.filter(item => item.producto.toString() !== productoId.toString());
  return this.save();
};

/**
 * Vacía el carrito completamente
 * @returns {Promise<Cart>}
 */
cartSchema.methods.limpiar = function () {
  this.items = [];
  return this.save();
};

export default mongoose.model('Cart', cartSchema);