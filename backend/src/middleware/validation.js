/**
 * validation.js - Validación de Entrada con Zod
 * 
 * ARQUITECTURA:
 * - validate(schema): Middleware para validar req.body
 * - validateParams(schema): Middleware para validar req.params
 * - validateQuery(schema): Middleware para validar req.query
 * - schemas: Objeto con todos los esquemas Zod reutilizables
 * 
 * FLUJO:
 * 1. Request llega a ruta
 * 2. Middleware validate(schema) intercepta
 * 3. schema.safeParse(req.body) valida sin lanzar excepción
 * 4. Si falla -> 400 con array de errores {field, message}
 * 5. Si OK -> req.body = data parseada (tipada y sanitizada) -> next()
 * 
 * VENTAJAS ZOD:
 * - Type-safe (inferencia TypeScript si se usa)
 * - Coerción automática (z.coerce.number() convierte "12" -> 12)
 * - Refinamientos custom (.refine)
 * - Mensajes de error personalizados
 */

import { z } from 'zod';
import { CATEGORIAS_FIJAS } from '../models/Category.js';
import { MAX_MINOR_AMOUNT } from '../services/money.js';
import { ErrorCodes, sendError } from './apiError.js';

/**
 * Importe monetario: entero, no negativo y dentro del rango representable.
 *
 * `z.number().min(0)` acepta 58000.5, y medio peso arrastrado por cada subtotal
 * se convierte en un total que no cuadra. Al exigir entero aqui, ningun cliente
 * puede introducir fracciones: la base de datos es la segunda barrera (ver
 * services/money.js y los validadores de los modelos).
 */
const minorAmount = (label) =>
  z.number({ invalid_type_error: `${label} debe ser un numero` })
    .int(`${label} debe ser un numero entero (la moneda no tiene centavos)`)
    .min(0, `${label} no puede ser negativo`)
    .max(MAX_MINOR_AMOUNT, `${label} excede el maximo representable`);

const assetUrl = z.string().trim().min(1).refine(value => {
  if (/[\u0000-\u001f\\]/.test(value)) return false;
  if (value.startsWith('/')) return !value.startsWith('//') && !value.includes('..');
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}, 'Debe ser una URL HTTP(S) válida o una ruta local segura');

const imagePosition = z.string().trim().regex(/^(?:center|top|bottom|left|right)(?:\s+(?:center|top|bottom|left|right|[0-9]{1,3}%|[0-9]{1,3}(?:px|rem|em)))?$|^[0-9]{1,3}%\s+[0-9]{1,3}%$/i, 'Posición de imagen inválida').default('center');

/**
 * Nombre de categoría válido. La lista es cerrada (ver Category.js) porque las
 * pestañas del catálogo están escritas contra esos nombres. Se valida aquí y no
 * solo en Mongoose para devolver un error de campo uniforme, en vez del mensaje
 * interno de BSON que se escapa al cliente.
 */
const categoryName = z.string()
  .trim()
  .toLowerCase()
  .min(2, 'El nombre de la categoría debe tener al menos 2 caracteres')
  .refine(
    value => CATEGORIAS_FIJAS.includes(value),
    `Categoría no válida. Las permitidas son: ${CATEGORIAS_FIJAS.join(', ')}`
  );

const optionalBooleanQuery = z.preprocess(
  value => value === undefined ? undefined : value === 'true' || value === true,
  z.boolean().optional()
);

/**
 * Factory: Crea middleware de validación para req.body
 * @param {z.ZodSchema} schema - Esquema Zod
 * @returns {Function} Middleware Express
 */
export const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    // Formatea errores Zod a array simple {field, message}
    const details = result.error.errors.map(err => ({
      field: err.path.join('.'),    // ej: "direccionEnvio.ciudad"
      message: err.message,
    }));
    return sendError(res, 400, ErrorCodes.VALIDATION_ERROR, 'Datos de entrada inválidos', { details });
  }
  // Reemplaza body con data validada y tipada (coerción aplicada)
  req.body = result.data;
  next();
};

// ==========================================
// ESQUEMAS ZOD - Definidos una vez, reutilizados en routes
// ==========================================

export const schemas = {
  // POST /api/auth/register
  register: z.object({
    nombre: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(50),
    apellido: z.string().min(2, 'El apellido debe tener al menos 2 caracteres').max(50),
    email: z.string().email('Email inválido').toLowerCase(),  // Normaliza
    password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(128),
    telefono: z.string().regex(/^[\d\s\-\+\(\)]{7,20}$/, 'Teléfono inválido').optional(),
    // z.literal(true) = DEBE ser exactamente true (no "true", no 1)
    aceptoTerminos: z.literal(true, { errorMap: () => ({ message: 'Debe aceptar los términos y condiciones' }) }),
    aceptoPrivacidad: z.literal(true, { errorMap: () => ({ message: 'Debe aceptar la política de privacidad' }) }),
  }),

  // POST /api/auth/login
  login: z.object({
    email: z.string().email('Email inválido').toLowerCase(),
    password: z.string().min(1, 'La contraseña es obligatoria'),
    rememberMe: z.boolean().optional().default(false),
  }),

  // PATCH /api/auth/profile
  updateProfile: z.object({
    nombre: z.string().min(2).max(50).optional(),
    apellido: z.string().min(2).max(50).optional(),
    telefono: z.string().regex(/^[\d\s\-\+\(\)]{7,20}$/).optional(),
  }),

  // PATCH /api/auth/password
  changePassword: z.object({
    currentPassword: z.string().min(1, 'Contraseña actual requerida'),
    newPassword: z.string().min(8, 'La nueva contraseña debe tener al menos 8 caracteres').max(128),
  }).refine(data => data.currentPassword !== data.newPassword, {
    message: 'La nueva contraseña debe ser diferente a la actual',
    path: ['newPassword'],  // Error asociado a este campo
  }),

  // POST /api/auth/addresses
  addAddress: z.object({
    alias: z.string().min(2, 'El alias debe tener al menos 2 caracteres').max(30),
    nombreCompleto: z.string().min(2, 'El nombre completo es obligatorio').max(100),
    telefono: z.string().regex(/^[\d\s\-\+\(\)]{7,20}$/, 'Teléfono inválido'),
    direccion: z.string().min(5, 'La dirección es obligatoria').max(200),
    ciudad: z.string().min(2, 'La ciudad es obligatoria').max(50),
    departamento: z.string().min(2, 'El departamento es obligatorio').max(50),
    codigoPostal: z.string().max(10).optional(),
    esPrincipal: z.boolean().default(false),
  }),

  // PATCH /api/auth/addresses/:addressId
  updateAddress: z.object({
    alias: z.string().min(2).max(30).optional(),
    nombreCompleto: z.string().min(2).max(100).optional(),
    telefono: z.string().regex(/^[\d\s\-\+\(\)]{7,20}$/).optional(),
    direccion: z.string().min(5).max(200).optional(),
    ciudad: z.string().min(2).max(50).optional(),
    departamento: z.string().min(2).max(50).optional(),
    codigoPostal: z.string().max(10).optional(),
    esPrincipal: z.boolean().optional(),
  }),

  // POST /api/cart
  addToCart: z.object({
    productoId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID de producto inválido'), // ObjectId hex
    cantidad: z.number().int().min(1, 'La cantidad mínima es 1').max(99, 'La cantidad máxima es 99').default(1),
  }),

  // PATCH /api/cart/:itemId
  updateCartItem: z.object({
    cantidad: z.number().int().min(1, 'La cantidad mínima es 1').max(99),
  }),

  // POST /api/orders
  createOrder: z.object({
    direccionEnvio: z.object({
      alias: z.string().min(2).max(30),
      nombreCompleto: z.string().min(2).max(100),
      telefono: z.string().regex(/^[\d\s\-\+\(\)]{7,20}$/),
      direccion: z.string().min(5).max(200),
      ciudad: z.string().min(2).max(50),
      departamento: z.string().min(2).max(50),
      codigoPostal: z.string().max(10).optional(),
    }),
    notas: z.string().max(500).optional(),
  }),

  // GET /api/products (query params)
  productQuery: z.object({
    page: z.coerce.number().int().min(1).default(1),        // "1" -> 1
    limit: z.coerce.number().int().min(1).max(50).default(12),
    categoria: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(), // ObjectId
    marca: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
    search: z.string().max(100).optional(),
    q: z.string().trim().min(2).max(100).optional(),
    minPrice: z.coerce.number().min(0).optional(),
    maxPrice: z.coerce.number().min(0).optional(),
    enPromocion: optionalBooleanQuery,
    destacado: optionalBooleanQuery,
    activo: optionalBooleanQuery,
    sort: z.enum(['nuevos', 'mas_vendidos', 'precio_asc', 'precio_desc', 'descuento']).default('nuevos'),
  }).superRefine((data, ctx) => {
    if (data.minPrice !== undefined && data.maxPrice !== undefined && data.minPrice > data.maxPrice) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['minPrice'], message: 'minPrice no puede superar maxPrice' });
    }
  }),

  categoryQuery: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(12),
    sort: z.enum(['nuevos', 'mas_vendidos', 'precio_asc', 'precio_desc', 'descuento']).default('nuevos'),
  }),

  orderQuery: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10),
    estado: z.enum(['pendiente', 'confirmado', 'procesando', 'enviado', 'entregado', 'cancelado', 'reembolsado']).optional(),
  }),

  adminOrderQuery: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    estado: z.enum(['pendiente', 'confirmado', 'procesando', 'enviado', 'entregado', 'cancelado', 'reembolsado']).optional(),
    estadoPago: z.enum(['pendiente', 'pagado', 'fallido', 'reembolsado']).optional(),
  }),

  updateAdminOrder: z.object({
    estado: z.enum(['pendiente', 'confirmado', 'procesando', 'enviado', 'entregado', 'cancelado', 'reembolsado']).optional(),
    estadoPago: z.enum(['pendiente', 'pagado', 'fallido', 'reembolsado']).optional(),
    notas: z.string().max(500).optional(),
  }),

  userQuery: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(100).optional(),
    role: z.enum(['user', 'admin']).optional(),
    activo: optionalBooleanQuery,
  }),

  cancelOrder: z.object({
    motivo: z.string().trim().max(500).optional(),
  }),

  contact: z.object({
    nombre: z.string().trim().min(2).max(100),
    email: z.string().trim().email('Email inválido').toLowerCase(),
    telefono: z.string().trim().regex(/^[\d\s\-\+\(\)]{7,20}$/).optional().or(z.literal('')),
    mensaje: z.string().trim().min(10).max(2000),
    website: z.string().max(200).optional(),
  }),

  contactQuery: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    estado: z.enum(['nuevo', 'atendido']).optional(),
  }),

  updateContact: z.object({
    estado: z.enum(['nuevo', 'atendido']),
  }),

  // PATCH /api/users/:id/role
  // Estas dos rutas no tenian esquema: el controlador comprobaba el rol a mano
  // con `['user','admin'].includes(role)`, lo que deja pasar cuerpos con tipos
  // raros y sin `role` (undefined -> "Rol invalido" en vez de un error de campo).
  updateUserRole: z.object({
    role: z.enum(['user', 'admin'], {
      errorMap: () => ({ message: 'El rol debe ser "user" o "admin"' }),
    }),
  }),

  // PATCH /api/users/:id/toggle-active
  // Alterna el estado, asi que un cuerpo vacio es valido. Se acepta tambien un
  // `activo` explicito para que un cliente pueda fijar el valor en vez de
  // confiar del toggle.
  toggleUserActive: z.object({
    activo: z.boolean().optional(),
  }).strict().default({}),

  // POST /api/admin/productos
  createProduct: z.object({
    nombre: z.string().min(2).max(100),
    slug: z.string().trim().min(1).max(120).regex(/^[a-z0-9-]+$/).optional(),
    descripcion: z.string().min(10).max(1000),
    descripcionCorta: z.string().max(200).optional(),
    precio: minorAmount('El precio'),
    precioAnterior: minorAmount('El precio anterior').optional(),
    stock: z.number().int().min(0).default(0),
    categoria: z.string().regex(/^[0-9a-fA-F]{24}$/),  // ObjectId requerido
    marca: z.string().regex(/^[0-9a-fA-F]{24}$/),
    imagenes: z.array(z.object({
      url: assetUrl,              // Debe ser URL válida
      alt: z.string().optional(),
      posicion: imagePosition,
      esPrincipal: z.boolean().default(false),
    })).min(1, 'Al menos una imagen es requerida'),
    ingredientes: z.array(z.object({
      nombre: z.string(),
      descripcion: z.string().optional(),
    })).optional(),
    uso: z.string().optional(),
    destacado: z.boolean().default(false),
    enPromocion: z.boolean().default(false),
    activo: z.boolean().default(true),
  }),

  // PATCH /api/admin/productos/:id
  updateProduct: z.object({
    nombre: z.string().min(2).max(100).optional(),
    slug: z.string().trim().min(1).max(120).regex(/^[a-z0-9-]+$/).optional(),
    descripcion: z.string().min(10).max(1000).optional(),
    descripcionCorta: z.string().max(200).nullable().optional(),
    precio: minorAmount('El precio').optional(),
    precioAnterior: minorAmount('El precio anterior').nullable().optional(),
    stock: z.number().int().min(0).optional(),
    categoria: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
    marca: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
    imagenes: z.array(z.object({
      url: assetUrl,
      alt: z.string().optional(),
      posicion: imagePosition,
      esPrincipal: z.boolean().default(false),
    })).optional(),
    ingredientes: z.array(z.object({
      nombre: z.string(),
      descripcion: z.string().optional(),
    })).optional(),
    uso: z.string().nullable().optional(),
    destacado: z.boolean().optional(),
    enPromocion: z.boolean().optional(),
    activo: z.boolean().optional(),
  }),

  // POST /api/auth/forgot-password
  forgotPassword: z.object({
    email: z.string().email('Email inválido').toLowerCase(),
  }),

  // POST /api/auth/reset-password
  resetPassword: z.object({
    token: z.string().regex(/^[a-f0-9]{64}$/i, 'Token inválido'),
    password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(128),
    confirmPassword: z.string().min(1, 'Confirma la contraseña'),
  }).refine(data => data.password === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  }),

  // POST /api/admin/categorias
  createCategory: z.object({
    nombre: categoryName,
    slug: z.string().trim().min(1).max(120).regex(/^[a-z0-9-]+$/).optional(),
    descripcion: z.string().max(200).optional(),
    imagen: assetUrl.optional(),
    orden: z.number().int().min(0).default(0),
    activo: z.boolean().default(true),
  }),

  // PATCH /api/admin/categorias/:id
  updateCategory: z.object({
    nombre: categoryName.optional(),
    slug: z.string().trim().min(1).max(120).regex(/^[a-z0-9-]+$/).optional(),
    descripcion: z.string().max(200).nullable().optional(),
    imagen: assetUrl.nullable().optional(),
    orden: z.number().int().min(0).optional(),
    activo: z.boolean().optional(),
  }),

  // POST /api/admin/marcas
  createBrand: z.object({
    nombre: z.string().min(2).max(100).refine(value => !['__proto__', 'constructor', 'prototype'].includes(value.toLowerCase()), 'Nombre de marca no permitido'),
    slug: z.string().trim().min(1).max(120).regex(/^[a-z0-9-]+$/).optional(),
    descripcion: z.string().max(300).optional(),
    logo: assetUrl.optional(),
    imagenBanner: assetUrl.optional(),
    sitioWeb: assetUrl.optional(),
    orden: z.number().int().min(0).default(0),
    activo: z.boolean().default(true),
  }),

  // PATCH /api/admin/marcas/:id
  updateBrand: z.object({
    nombre: z.string().min(2).max(100).refine(value => !['__proto__', 'constructor', 'prototype'].includes(value.toLowerCase()), 'Nombre de marca no permitido').optional(),
    slug: z.string().trim().min(1).max(120).regex(/^[a-z0-9-]+$/).optional(),
    descripcion: z.string().max(300).nullable().optional(),
    logo: assetUrl.nullable().optional(),
    imagenBanner: assetUrl.nullable().optional(),
    sitioWeb: assetUrl.nullable().optional(),
    orden: z.number().int().min(0).optional(),
    activo: z.boolean().optional(),
  }),
};

/**
 * Factory: Middleware para validar req.params (ej: :id, :addressId)
 */
export const validateParams = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.params);
  if (!result.success) {
    const details = result.error.errors.map(err => ({
      field: err.path.join('.'),
      message: err.message,
    }));
    return sendError(res, 400, ErrorCodes.VALIDATION_ERROR, 'Parámetros inválidos', { details });
  }
  next();
};

/**
 * Factory: Middleware para validar req.query (query string)
 * Coacciona tipos automáticamente (z.coerce)
 */
export const validateQuery = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.query);
  if (!result.success) {
    const details = result.error.errors.map(err => ({
      field: err.path.join('.'),
      message: err.message,
    }));
    return sendError(res, 400, ErrorCodes.VALIDATION_ERROR, 'Parámetros de consulta inválidos', { details });
  }
  // Reemplaza query con data validada y tipada
  req.query = result.data;
  next();
};