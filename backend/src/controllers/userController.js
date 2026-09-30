/**
 * userController.js - Controladores de Gestión de Usuarios (Solo Admin)
 * 
 * RUTAS ASOCIADAS (routes/users.js) - TODAS PROTEGIDAS (authenticate + authorize('admin')):
 * GET    /api/users              -> getUsers (listado con búsqueda, paginación)
 * GET    /api/users/:id          -> getUser (detalle)
 * PATCH  /api/users/:id/role     -> updateUserRole (cambiar user/admin)
 * PATCH  /api/users/:id/toggle-active -> toggleUserActive (activar/desactivar)
 * DELETE /api/users/:id          -> deleteUser (hard delete)
 * 
 * NOTA: Estos endpoints son SOLO para admins.
 * Usuarios normales gestionan su perfil en /api/auth/profile
 */

import { User } from '../models/index.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';

/**
 * GET /api/users
 * Lista usuarios con filtros y paginación
 * Query: page, limit, search (nombre/apellido/email), role
 * Excluye password (.select('-password'))
 */
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
let adminMutationQueue = Promise.resolve();
const withAdminMutation = async fn => {
  const previous = adminMutationQueue;
  let release;
  adminMutationQueue = new Promise(resolve => { release = resolve; });
  await previous;
  try {
    return await fn();
  } finally {
    release();
  }
};

const activeAdminCount = (excludeId = null) => User.countDocuments({
  role: 'admin',
  activo: true,
  ...(excludeId ? { _id: { $ne: excludeId } } : {}),
});

export const getUsers = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search, role, activo } = req.query;
  const skip = (page - 1) * limit;

  const filter = {};
  if (search) {
    // Búsqueda case-insensitive en múltiples campos
    const safeSearch = escapeRegex(search);
    filter.$or = [
      { nombre: { $regex: safeSearch, $options: 'i' } },
      { apellido: { $regex: safeSearch, $options: 'i' } },
      { email: { $regex: safeSearch, $options: 'i' } },
    ];
  }
  if (role) filter.role = role;
  if (activo === 'true') filter.activo = true;
  if (activo === 'false') filter.activo = false;

  const [users, total] = await Promise.all([
    User.find(filter)
      .select('-password')           // Nunca devolver password
      .sort({ createdAt: -1 })       // Más recientes primero
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    count: users.length,
    total,
    page: Number(page),
    pages: Math.ceil(total / limit),
    users,
  });
});

/**
 * GET /api/users/:id
 * Detalle de usuario (sin password)
 */
export const getUser = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id).select('-password');
  if (!user) {
    return next(new AppError('Usuario no encontrado', 404, 'USER_NOT_FOUND'));
  }
  res.status(200).json({ success: true, user });
});

/**
 * PATCH /api/users/:id/role
 * Cambia rol: 'user' | 'admin'
 * Valida rol permitido
 */
export const updateUserRole = asyncHandler(async (req, res, next) => withAdminMutation(async () => {
  const { role } = req.body;
  if (!['user', 'admin'].includes(role)) {
    return next(new AppError('Rol inválido', 400, 'INVALID_ROLE'));
  }

  const user = await User.findById(req.params.id);
  if (!user) {
    return next(new AppError('Usuario no encontrado', 404, 'USER_NOT_FOUND'));
  }
  if (user.role === 'admin' && role !== 'admin' && await activeAdminCount(user._id) === 0) {
    return next(new AppError('Debe existir al menos un administrador activo', 400, 'LAST_ADMIN'));
  }
  user.role = role;
  await user.save();
  const safeUser = {
    id: user._id,
    nombre: user.nombre,
    apellido: user.apellido,
    email: user.email,
    role: user.role,
    activo: user.activo,
  };
  res.status(200).json({ success: true, message: 'Rol actualizado', user: safeUser });
}));

/**
 * PATCH /api/users/:id/toggle-active
 * Alterna estado activo/inactivo (soft delete)
 * Usuario inactivo no puede loguearse
 */
export const toggleUserActive = asyncHandler(async (req, res, next) => withAdminMutation(async () => {
  const user = await User.findById(req.params.id);
  if (!user) {
    return next(new AppError('Usuario no encontrado', 404, 'USER_NOT_FOUND'));
  }

  // Alternar es el comportamiento por defecto (cuerpo vacio), pero si el cliente
  // envia `activo` se respeta su valor. El esquema Zod (validation.js, schema
  // `toggleUserActive`) acepta el campo a proposito para eso; antes se validaba y
  // luego se ignoraba, de modo que un cliente que mandara {activo: false} sobre
  // un usuario ya inactivo lo ACTIVABA, al contrario de lo que habia pedido.
  const activar = typeof req.body.activo === 'boolean' ? req.body.activo : !user.activo;

  if (activar === user.activo) {
    // Peticion idempotente: ya estaba en ese estado. No cuenta como cambio.
    return res.status(200).json({
      success: true,
      message: `Usuario ya estaba ${activar ? 'activado' : 'desactivado'}`,
      user: { id: user._id, email: user.email, activo: user.activo },
    });
  }

  // Un usuario no puede desactivarse a si mismo, y no puede quedar el sistema
  // sin ningun administrador activo. Se comprueba el valor de destino, no el
  // estado actual, para que las dos guardas sirvan tambien cuando el cliente
  // fija `activo` en vez de alternar.
  if (!activar && user._id.toString() === req.userId.toString()) {
    return next(new AppError('No puedes desactivar tu propia cuenta de administrador', 400, 'SELF_DEACTIVATE'));
  }
  if (!activar && user.role === 'admin' && user.activo && await activeAdminCount(user._id) === 0) {
    return next(new AppError('Debe existir al menos un administrador activo', 400, 'LAST_ADMIN'));
  }

  user.activo = activar;
  await user.save();

  res.status(200).json({
    success: true,
    message: `Usuario ${user.activo ? 'activado' : 'desactivado'}`,
    user: { id: user._id, email: user.email, activo: user.activo },
  });
}));

/**
 * DELETE /api/users/:id
 * Elimina usuario (hard delete)
 * Protección: admin no puede eliminarse a sí mismo
 */
export const deleteUser = asyncHandler(async (req, res, next) => withAdminMutation(async () => {
  const user = await User.findById(req.params.id);
  if (!user) {
    return next(new AppError('Usuario no encontrado', 404, 'USER_NOT_FOUND'));
  }

  if (user._id.toString() === req.userId.toString()) {
    return next(new AppError('No puedes eliminarte a ti mismo', 400, 'SELF_DELETE'));
  }

  if (user.role === 'admin' && await activeAdminCount(user._id) === 0) {
    return next(new AppError('Debe existir al menos un administrador activo', 400, 'LAST_ADMIN'));
  }

  user.activo = false;
  await user.save();

  res.status(200).json({ success: true, message: 'Usuario desactivado' });
}));