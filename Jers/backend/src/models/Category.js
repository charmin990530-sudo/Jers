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

const categorySchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: [true, 'El nombre de la categoría es obligatorio'],
    unique: true,
    trim: true,
    // Enum fijo: coincide con tabs del frontend
    enum: ['rostro', 'ojos', 'labios', 'shampoo', 'acondicionador', 'tratamientos'],
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