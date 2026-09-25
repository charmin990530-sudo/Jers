/**
 * User.js - Modelo de Usuario
 * 
 * CAMPOS PRINCIPALES:
 * - email: único, lowercase, validado con regex
 * - password: hasheado con bcrypt (select: false = no se devuelve en queries por defecto)
 * - nombre, apellido: requeridos, max 50 chars
 * - telefono: opcional, validado con regex flexible
 * - role: 'user' | 'admin' (default: 'user')
 * - direcciones: array de subdocumentos addressSchema
 * - aceptoTerminos/Privacidad: booleanos requeridos para compliance legal
 * - activo: soft delete (false = usuario desactivado)
 * - ultimoAcceso: tracking de última actividad
 * 
 * VIRTUALES:
 * - nombreCompleto: concatena nombre + apellido
 * 
 * MIDDLEWARES:
 * - pre('save'): hashea password solo si fue modificado (bcrypt 12 rounds)
 * 
 * MÉTODOS DE INSTANCIA:
 * - compararPassword(password): verifica password plano vs hash
 * - tieneDireccionPrincipal(): boolean si alguna dirección es principal
 */
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

// Subdocumento: Dirección de envío/facturación
// _id: true genera ObjectId único para cada dirección (útil para editar/eliminar específica)
const addressSchema = new mongoose.Schema({
  alias: { type: String, required: true },           // ej: "Casa", "Trabajo", "Mamá"
  nombreCompleto: { type: String, required: true },  // Nombre para el paquete
  telefono: { type: String, required: true },        // Contacto para entrega
  direccion: { type: String, required: true },       // Calle, número, apto
  ciudad: { type: String, required: true },
  departamento: { type: String, required: true },    // Estado/Provincia
  codigoPostal: { type: String },                    // Opcional
  esPrincipal: { type: Boolean, default: false },    // Una sola dirección principal
}, { _id: true });

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'El email es obligatorio'],
    unique: true,              // Índice único automático en MongoDB
    lowercase: true,           // Normaliza a minúsculas
    trim: true,                // Quita espacios
    match: [/^\S+@\S+\.\S+$/, 'Email inválido'], // Validación básica
  },
  password: {
    type: String,
    required: [true, 'La contraseña es obligatoria'],
    minlength: [8, 'La contraseña debe tener al menos 8 caracteres'],
    select: false,             // IMPORTANTE: No incluir en queries por seguridad
  },
  nombre: {
    type: String,
    required: [true, 'El nombre es obligatorio'],
    trim: true,
    maxlength: [50, 'El nombre no puede exceder 50 caracteres'],
  },
  apellido: {
    type: String,
    required: [true, 'El apellido es obligatorio'],
    trim: true,
    maxlength: [50, 'El apellido no puede exceder 50 caracteres'],
  },
  telefono: {
    type: String,
    trim: true,
    match: [/^[\d\s\-\+\(\)]{7,20}$/, 'Teléfono inválido'],
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user',
  },
  direcciones: [addressSchema],
  aceptoTerminos: {
    type: Boolean,
    required: [true, 'Debe aceptar los términos y condiciones'],
    default: false,
  },
  aceptoPrivacidad: {
    type: Boolean,
    required: [true, 'Debe aceptar la política de privacidad'],
    default: false,
  },
  fechaAceptacionTerminos: { type: Date },
  fechaAceptacionPrivacidad: { type: Date },
  activo: { type: Boolean, default: true },      // Soft delete
  ultimoAcceso: { type: Date },                  // Tracking actividad
  tokenVersion: { type: Number, default: 0, min: 0 },

  // --- Password Reset ---
  resetPasswordToken: { type: String, select: false },     // Token hash (no se devuelve)
  resetPasswordExpires: { type: Date, select: false },     // Expiración token
}, {
  timestamps: true,            // createdAt, updatedAt automáticos
  toJSON: { virtuals: true },  // Incluye virtuals al hacer .toJSON()
  toObject: { virtuals: true },
});

// Virtual: nombre completo (no se guarda en BD, se computa al leer)
userSchema.virtual('nombreCompleto').get(function () {
  return `${this.nombre} ${this.apellido}`;
});

// Middleware pre-save: Hashear password ANTES de guardar
// Solo hashea si password fue modificado (no en cada save)
// bcrypt rounds=12: equilibrio seguridad/rendimiento (2024 estándar)
userSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Método de instancia: Comparar password plano con hash guardado
// Uso: const isMatch = await user.compararPassword('password123')
userSchema.methods.compararPassword = async function (password) {
  return await bcrypt.compare(password, this.password);
};

// Método de instancia: Verifica si el usuario tiene dirección marcada como principal
userSchema.methods.tieneDireccionPrincipal = function () {
  return this.direcciones.some(d => d.esPrincipal);
};

export default mongoose.model('User', userSchema);