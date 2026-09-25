/**
 * Product.js - Modelo de Producto
 * 
 * CAMPOS PRINCIPALES:
 * - nombre: único, max 100 chars
 * - slug: URL amigable, único, generado auto desde nombre
 * - descripcion: completa (max 1000), descripcionCorta: para cards (max 200)
 * - precio: actual, precioAnterior: para mostrar descuento (validado > precio)
 * - stock: inventario, decrementa al crear orden
 * - sku: código único auto-generado (sparse: permite nulls múltiples)
 * - imagenes: array de objetos {url, alt, posicion, esPrincipal}
 * - categoria, marca: referencias ObjectId (populate en queries)
 * - ingredientes: array {nombre, descripcion} - info técnica
 * - uso: instrucciones de aplicación
 * - destacado: aparece en home (/api/products/featured)
 * - enPromocion: aparece en ofertas (/api/products/promociones)
 * - activo: soft delete (false = oculta de catálogo)
 * - vendidos: contador para ordenar por "más vendidos"
 * 
 * VIRTUALES:
 * - descuentoPorcentaje: % calculado si hay precioAnterior > precio
 * - imagenPrincipal: primera con esPrincipal:true o primera del array
 * 
 * MIDDLEWARES:
 * - pre('save'): auto-genera slug, sku, asegura 1 imagen principal
 * 
 * ÍNDICES:
 * - text search en nombre + descripcion
 * - compuestos para filtros comunes (categoria+activo, marca+activo, etc.)
 */
import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: [true, 'El nombre del producto es obligatorio'],
    trim: true,
    maxlength: [100, 'El nombre no puede exceder 100 caracteres'],
  },
  slug: {
    type: String,
    required: true,
    unique: true,        // Índice único para URLs limpias: /producto/base-atenea
    lowercase: true,
  },
  descripcion: {
    type: String,
    required: [true, 'La descripción es obligatoria'],
    trim: true,
    maxlength: [1000, 'La descripción no puede exceder 1000 caracteres'],
  },
  descripcionCorta: {
    type: String,
    trim: true,
    maxlength: [200, 'La descripción corta no puede exceder 200 caracteres'],
  },
  precio: {
    type: Number,
    required: [true, 'El precio es obligatorio'],
    min: [0, 'El precio no puede ser negativo'],
  },
  precioAnterior: {
    type: Number,
    min: [0, 'El precio anterior no puede ser negativo'],
    // Validación custom: si existe, debe ser mayor que precio actual
    validate: {
      validator: function (value) {
        return !value || value > this.precio;
      },
      message: 'El precio anterior debe ser mayor al precio actual',
    },
  },
  stock: {
    type: Number,
    required: [true, 'El stock es obligatorio'],
    min: [0, 'El stock no puede ser negativo'],
    default: 0,
  },
  sku: {
    type: String,
    unique: true,
    sparse: true,        // Permite múltiples nulls, pero valores únicos si existen
    trim: true,
    uppercase: true,
  },
  imagenes: [{
    url: { type: String, required: true },
    alt: { type: String },              // SEO + accesibilidad
    posicion: { type: String, default: 'center' }, // object-position CSS
    esPrincipal: { type: Boolean, default: false }, // Una sola principal
  }],
  categoria: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: [true, 'La categoría es obligatoria'],
  },
  marca: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Brand',
    required: [true, 'La marca es obligatoria'],
  },
  ingredientes: [{
    nombre: { type: String, required: true },
    descripcion: { type: String },
  }],
  uso: { type: String, trim: true },
  destacado: { type: Boolean, default: false },   // Home page
  enPromocion: { type: Boolean, default: false }, // Sección ofertas
  activo: { type: Boolean, default: true },       // Soft delete
  vendidos: { type: Number, default: 0 },         // Para ranking "más vendidos"
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

productSchema.pre('validate', function () {
  if (!this.slug && this.nombre) {
    this.slug = this.nombre
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
  if (!this.sku && this.nombre) {
    this.sku = `BJ-${this.nombre.substring(0, 3).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
  }
});

// Virtual: % descuento calculado dinámicamente
// Ej: precioAnterior=100, precio=80 -> 20%
productSchema.virtual('descuentoPorcentaje').get(function () {
  if (this.precioAnterior && this.precioAnterior > this.precio) {
    return Math.round(((this.precioAnterior - this.precio) / this.precioAnterior) * 100);
  }
  return 0;
});

// Virtual: URL de imagen principal para cards/listados
// Busca imagen con esPrincipal:true, si no existe usa la primera
productSchema.virtual('imagenPrincipal').get(function () {
  const principal = this.imagenes.find(img => img.esPrincipal);
  return principal ? principal.url : (this.imagenes[0]?.url || null);
});

// Middleware pre-save: Auto-genera campos derivados
productSchema.pre('save', function (next) {
  // Slug desde nombre: "Base Atenea" -> "base-atenea"
  if (!this.slug) {
    this.slug = this.nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }
  // SKU único: "BJ-BAS-A1B2C3" (3 letras nombre + timestamp base36)
  if (!this.sku) {
    this.sku = `BJ-${this.nombre.substring(0, 3).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
  }
  // Asegurar EXACTAMENTE una imagen principal
  const principalCount = this.imagenes.filter(img => img.esPrincipal).length;
  if (principalCount === 0 && this.imagenes.length > 0) {
    this.imagenes[0].esPrincipal = true;           // Primera se vuelve principal
  } else if (principalCount > 1) {
    let found = false;
    this.imagenes.forEach(img => {                 // Solo la primera mantiene true
      if (img.esPrincipal && !found) {
        found = true;
      } else {
        img.esPrincipal = false;
      }
    });
  }
  next();
});

// ÍNDICES PARA PERFORMANCE EN QUERIES COMUNES:
// Text search: GET /api/products/buscar?q=base
productSchema.index({ nombre: 'text', descripcion: 'text' });
// Filtros categoría + activos: GET /api/products?categoria=xxx
productSchema.index({ categoria: 1, activo: 1 });
// Filtros marca + activos: GET /api/products?marca=xxx
productSchema.index({ marca: 1, activo: 1 });
// Destacados home: GET /api/products/featured
productSchema.index({ destacado: 1, activo: 1 });
// Promociones: GET /api/products/promociones
productSchema.index({ enPromocion: 1, activo: 1 });

export default mongoose.model('Product', productSchema);