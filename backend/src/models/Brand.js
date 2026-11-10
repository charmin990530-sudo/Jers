/**
 * Brand.js - Modelo de Marca
 * 
 * CAMPOS:
 * - nombre: único, requerido
 * - slug: URL amigable, único, auto-generado
 * - descripcion: info de la marca (max 300)
 * - logo: URL logo marca (para cards/filtros)
 * - imagenBanner: banner para página de marca
 * - sitioWeb: URL oficial (validación URL en controller)
 * - orden: para ordenar en carrusel marca (menor primero)
 * - activo: soft delete
 * 
 * MIDDLEWARE:
 * - pre('save'): auto-genera slug
 * 
 * USO EN FRONTEND:
 * - Carrusel infinito en home (marcas-seccion)
 * - Filtro en GET /api/products?marca=xxx
 * - Agrupación en catálogos (marca-bloque)
 * - Admin: CRUD completo
 */
import mongoose from 'mongoose';

const brandSchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: [true, 'El nombre de la marca es obligatorio'],
    unique: true,
    trim: true,
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
    maxlength: [300, 'La descripción no puede exceder 300 caracteres'],
  },
  logo: { type: String },
  imagenBanner: { type: String },
  sitioWeb: { type: String },
  orden: { type: Number, default: 0 },
  activo: { type: Boolean, default: true },
}, {
  timestamps: true,
});

// Normaliza acentos y símbolos igual que el frontend (NFD + strip diacritics):
// "L'Bel Café" -> "lbel-cafe". Sin esto, el slug conservaba apóstrofes y el
// filtro por marca del catálogo no encontraba el documento.
const normalizarSlug = texto => texto
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

brandSchema.pre('validate', function () {
  if (!this.slug && this.nombre) {
    this.slug = normalizarSlug(this.nombre);
  }
});

brandSchema.pre('save', function (next) {
  if (!this.slug) {
    this.slug = normalizarSlug(this.nombre);
  }
  next();
});

export default mongoose.model('Brand', brandSchema);