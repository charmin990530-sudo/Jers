/**
 * Category.js - Modelo de Categoría
 * 
 * CATEGORÍAS FIJAS (enum): No se pueden crear categorías arbitrarias
 * - rostro, ojos, labios (maquillaje)
 * - shampoo, acondicionador, tratamientos (cuidado capilar)
 * 
 * CAMPOS:
 * - nombre: único, enum fijo (validación a nivel BD)
 * - slug: URL amigable, único, auto-generado
 * - descripcion: breve para UI (max 200)
 * - imagen: banner/icono de categoría
 * - orden: para ordenar en menús/tabs (menor primero)
 * - activo: soft delete
 * 
 * MIDDLEWARE:
 * - pre('save'): auto-genera slug desde nombre
 * 
 * USO EN FRONTEND:
 * - Tabs en maquillaje.html (rostro/ojos/labios)
 * - Tabs en cabello.html (shampoo/acondicionador/tratamientos)
 * - Filtro en GET /api/products?categoria=xxx
 */
import mongoose from 'mongoose';

/**
 * Categorías permitidas. Es una lista cerrada a propósito: las pestañas de
 * makeup.html y cabello.html están escritas contra estos nombres, así que
 * aceptarlas en la base dejaría tabs apuntando a nada.
 *
 * Se exporta para que la capa de validación (Zod) use exactamente la misma
 * lista. Si se validara solo en Mongoose, el usuario recibiría el mensaje
 * interno de BSON ("`X` is not a valid enum value for path `nombre`")
 * en vez de un error de campo como el de cualquier otra validación.
 */
export const CATEGORIAS_FIJAS = [
  'rostro',
  'ojos',
  'labios',
  'shampoo',
  'acondicionador',
  'tratamientos',
];

const categorySchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: [true, 'El nombre de la categoría es obligatorio'],
    unique: true,
    trim: true,
    // Enum fijo: coincide con tabs del frontend
    enum: {
      values: CATEGORIAS_FIJAS,
      message: `Categoría no válida. Las permitidas son: ${CATEGORIAS_FIJAS.join(', ')}`,
    },
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
  },
  descripcion: {
    type: String,
    trim: true,
    maxlength: [200, 'La descripción no puede exceder 200 caracteres'],
  },
  imagen: { type: String },
  orden: { type: Number, default: 0 },  // Para ordenar tabs/menús
  activo: { type: Boolean, default: true },
}, {
  timestamps: true,
});

categorySchema.pre('validate', function () {
  if (!this.slug && this.nombre) {
    this.slug = this.nombre.toLowerCase().replace(/\s+/g, '-');
  }
});

// Auto-genera slug: "Shampoo" -> "shampoo"
categorySchema.pre('save', function (next) {
  if (!this.slug) {
    this.slug = this.nombre.toLowerCase().replace(/\s+/g, '-');
  }
  next();
});

export default mongoose.model('Category', categorySchema);