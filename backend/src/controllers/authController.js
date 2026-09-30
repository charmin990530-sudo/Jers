/**
 * authController.js - Controladores de Autenticación y Perfil
 * 
 * RUTAS ASOCIADAS (routes/auth.js):
 * POST   /api/auth/register           -> register
 * POST   /api/auth/login              -> login
 * POST   /api/auth/logout             -> logout
 * GET    /api/auth/me                 -> getMe
 * PATCH  /api/auth/profile            -> updateProfile
 * PATCH  /api/auth/password           -> changePassword
 * POST   /api/auth/addresses          -> addAddress
 * PATCH  /api/auth/addresses/:id      -> updateAddress
 * DELETE /api/auth/addresses/:id      -> deleteAddress
 * 
 * FLUJO JWT:
 * 1. register/login -> crea JWT -> set cookie HttpOnly -> devuelve user (sin password)
 * 2. requests autenticados -> middleware authenticate() lee cookie -> req.user
 * 3. logout -> limpia cookie -> 200 OK
 * 
 * SEGURIDAD:
 * - Password NUNCA se devuelve en responses (select: false en modelo)
 * - Cookie: HttpOnly + Secure (prod) + SameSite=lax
 * - Token expira en 7d (JWT_EXPIRES_IN)
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { User } from '../models/index.js';
import { JWT_SECRET, JWT_ALGORITHM, JWT_ISSUER, JWT_AUDIENCE, JWT_EXPIRES_IN, SESSION_EXPIRES_IN, REMEMBER_ME_EXPIRES_IN, getDurationMs, JWT_COOKIE_NAME, COOKIE_SECURE, COOKIE_SAME_SITE, FRONTEND_URL } from '../config/env.js';
import { sendPasswordResetEmail } from '../services/emailService.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { ErrorCodes } from '../middleware/apiError.js';

/**
 * Crea JWT firmado con userId
 * @param {String|ObjectId} userId
 * @returns {String} JWT token
 */
const createToken = (userId, tokenVersion = 0, expiresIn = JWT_EXPIRES_IN) => jwt.sign(
  { id: userId, ver: tokenVersion },
  JWT_SECRET,
  { expiresIn, algorithm: JWT_ALGORITHM, issuer: JWT_ISSUER, audience: JWT_AUDIENCE },
);

/**
 * Helper: Genera token, setea cookie, actualiza ultimoAcceso, envía response
 * @param {User} user - Documento Mongoose User
 * @param {Number} statusCode - HTTP status (200, 201)
 * @param {Response} res - Express response
 * @param {String} message - Mensaje para frontend
 */
const sendTokenResponse = async (user, statusCode, res, message = 'Operación exitosa', rememberMe = false) => {
  const expiresIn = rememberMe ? REMEMBER_ME_EXPIRES_IN : SESSION_EXPIRES_IN;
  const token = createToken(user._id, user.tokenVersion, expiresIn);
  const cookieOptions = {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: COOKIE_SAME_SITE,
    maxAge: getDurationMs(expiresIn),
    path: '/',
  };

  res.cookie(JWT_COOKIE_NAME, token, cookieOptions);
  await User.findByIdAndUpdate(user._id, { ultimoAcceso: new Date() });

  res.status(statusCode).json({
    success: true,
    message,
    user: {
      id: user._id,
      nombre: user.nombre,
      apellido: user.apellido,
      nombreCompleto: user.nombreCompleto,
      email: user.email,
      telefono: user.telefono,
      role: user.role,
      direcciones: user.direcciones,
      createdAt: user.createdAt,
    },
  });
};

/**
 * POST /api/auth/register
 * Registra nuevo usuario, hashea password, setea cookie JWT
 * Body validado por schemas.register (Zod)
 */
export const register = asyncHandler(async (req, res, next) => {
  const { nombre, apellido, email, password, telefono, aceptoTerminos, aceptoPrivacidad } = req.body;

  // Verificar email único (aunque unique index en BD lo garantiza, mejor error amigable)
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return next(new AppError('Este email ya está registrado', 400, 'EMAIL_EXISTS'));
  }

  // Crea usuario (password se hashea en pre-save middleware del modelo)
  const user = await User.create({
    nombre,
    apellido,
    email,
    password,
    telefono,
    aceptoTerminos,
    aceptoPrivacidad,
    fechaAceptacionTerminos: new Date(),
    fechaAceptacionPrivacidad: new Date(),
  });

  // 201 Created + cookie + user data
  await sendTokenResponse(user, 201, res, 'Registro exitoso. ¡Bienvenido a By Jers!');
});

/**
 * POST /api/auth/login
 * Verifica credenciales, setea cookie JWT
 * Body validado por schemas.login
 */
export const login = asyncHandler(async (req, res, next) => {
  const { email, password, rememberMe } = req.body;

  // Usar findOne con select('+password') para incluir el campo password
  // que tiene select: false en el schema
  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

  if (!user || !user.activo) {
    return next(new AppError('Credenciales inválidas', 401, 'INVALID_CREDENTIALS'));
  }

  const isMatch = await user.compararPassword(password);
  if (!isMatch) {
    return next(new AppError('Credenciales inválidas', 401, 'INVALID_CREDENTIALS'));
  }

  await sendTokenResponse(user, 200, res, 'Inicio de sesión exitoso', rememberMe === true);
});

/**
 * POST /api/auth/logout
 * Limpia cookie JWT (maxAge: 0 = expira inmediatamente)
 * No requiere body
 */
export const logout = asyncHandler(async (req, res) => {
  if (req.user) {
    await User.findByIdAndUpdate(req.userId, { $inc: { tokenVersion: 1 } });
  }

  const cookieOptions = {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: COOKIE_SAME_SITE,
    maxAge: 0,           // Expira ya
    path: '/',
  };

  res.cookie(JWT_COOKIE_NAME, 'loggedout', cookieOptions);

  res.status(200).json({
    success: true,
    message: 'Sesión cerrada correctamente',
  });
});

/**
 * GET /api/auth/me
 * Obtiene usuario actual desde token (middleware authenticate ya puso req.userId)
 * Protegido: requiere autenticación
 */
export const getCsrfToken = (req, res) => {
  res.status(200).json({ success: true, csrfToken: req.csrfToken });
};

export const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);
  res.status(200).json({
    success: true,
    user: {
      id: user._id,
      nombre: user.nombre,
      apellido: user.apellido,
      nombreCompleto: user.nombreCompleto,
      email: user.email,
      telefono: user.telefono,
      role: user.role,
      direcciones: user.direcciones,
      createdAt: user.createdAt,
    },
  });
});

/**
 * PATCH /api/auth/profile
 * Actualiza nombre, apellido, telefono del usuario logueado
 * Body validado por schemas.updateProfile
 */
export const updateProfile = asyncHandler(async (req, res, next) => {
  const { nombre, apellido, telefono } = req.body;

  // new: true = devuelve doc actualizado
  // runValidators: true = valida con schema Mongoose
  const user = await User.findByIdAndUpdate(
    req.userId,
    { nombre, apellido, telefono },
    { new: true, runValidators: true }
  );

  res.status(200).json({
    success: true,
    message: 'Perfil actualizado correctamente',
    user: {
      id: user._id,
      nombre: user.nombre,
      apellido: user.apellido,
      nombreCompleto: user.nombreCompleto,
      email: user.email,
      telefono: user.telefono,
      role: user.role,
      direcciones: user.direcciones,
    },
  });
});

/**
 * PATCH /api/auth/password
 * Cambia contraseña verificando la actual
 * Body validado por schemas.changePassword (incluye refine: new !== current)
 */
export const changePassword = asyncHandler(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;

  // Busca user CON password para comparar
  const user = await User.findById(req.userId).select('+password');
  const isMatch = await user.compararPassword(currentPassword);
  if (!isMatch) {
    return next(new AppError('Contraseña actual incorrecta', 400, 'WRONG_PASSWORD'));
  }

  // Asigna nueva password (se hashea en pre-save)
  user.password = newPassword;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();

  await sendTokenResponse(user, 200, res, 'Contraseña actualizada correctamente');
});

/**
 * POST /api/auth/addresses
 * Agrega dirección al array del usuario
 * Lógica: solo una principal a la vez
 * Body validado por schemas.addAddress
 */
export const addAddress = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.userId);

  // Si nueva es principal, desmarca las demás
  if (req.body.esPrincipal) {
    user.direcciones.forEach(d => d.esPrincipal = false);
  } else if (user.direcciones.length === 0) {
    // Si es la primera, automáticamente principal
    req.body.esPrincipal = true;
  }

  user.direcciones.push(req.body);
  await user.save();

  res.status(201).json({
    success: true,
    message: 'Dirección agregada correctamente',
    direcciones: user.direcciones,
  });
});

/**
 * PATCH /api/auth/addresses/:addressId
 * Actualiza dirección existente por _id
 * Body validado por schemas.updateAddress
 */
export const updateAddress = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.userId);
  
  // Busca índice por _id del subdocumento
  const addressIndex = user.direcciones.findIndex(d => d._id.toString() === req.params.addressId);

  if (addressIndex === -1) {
    return next(new AppError('Dirección no encontrada', 404, 'ADDRESS_NOT_FOUND'));
  }

  // Si se marca principal, desmarca las demás
  if (req.body.esPrincipal) {
    user.direcciones.forEach(d => d.esPrincipal = false);
  }

  // Merge: mantiene campos no enviados, actualiza los enviados
  user.direcciones[addressIndex] = { ...user.direcciones[addressIndex].toObject(), ...req.body };
  await user.save();

  res.status(200).json({
    success: true,
    message: 'Dirección actualizada correctamente',
    direcciones: user.direcciones,
  });
});

/**
 * DELETE /api/auth/addresses/:addressId
 * Elimina dirección por _id
 * Si era principal y quedan otras, la primera pasa a ser principal
 */
export const deleteAddress = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.userId);
  const addressIndex = user.direcciones.findIndex(d => d._id.toString() === req.params.addressId);

  if (addressIndex === -1) {
    return next(new AppError('Dirección no encontrada', 404, 'ADDRESS_NOT_FOUND'));
  }

  const wasPrincipal = user.direcciones[addressIndex].esPrincipal;
  user.direcciones.splice(addressIndex, 1);

  // Reasignar principal si se borró la principal
  if (wasPrincipal && user.direcciones.length > 0) {
    user.direcciones[0].esPrincipal = true;
  }

  await user.save();

  res.status(200).json({
    success: true,
    message: 'Dirección eliminada correctamente',
    direcciones: user.direcciones,
  });
});

/**
 * POST /api/auth/forgot-password
 * Solicita restablecimiento de contraseña
 * Body validado por schemas.forgotPassword: { email }
 * Por seguridad, SIEMPRE responde éxito aunque el email no exista (evita user enumeration)
 */
export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email: email.toLowerCase(), activo: true });

  if (user) {
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = Date.now() + 60 * 60 * 1000;
    await user.save({ validateBeforeSave: false });

    const resetUrl = `${FRONTEND_URL.replace(/\/$/, '')}/reset-password.html?token=${encodeURIComponent(resetToken)}`;
    try {
      await sendPasswordResetEmail({ to: user.email, resetUrl });
    } catch {
      console.error('No se pudo enviar el correo de recuperación');
    }
  }

  res.status(200).json({
    success: true,
    message: 'Si el email existe en nuestra base de datos, recibirás instrucciones para restablecer tu contraseña.',
  });
});

/**
 * POST /api/auth/reset-password
 * Restablece contraseña con token
 * Body validado por schemas.resetPassword: { token, password, confirmPassword }
 */
export const resetPassword = asyncHandler(async (req, res, next) => {
  const { token, password, confirmPassword } = req.body;

  if (password !== confirmPassword) {
    return next(new AppError('Las contraseñas no coinciden', 400, ErrorCodes.PASSWORDS_MISMATCH));
  }

  // Hashear token recibido para comparar con el guardado
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  // Buscar usuario con token válido y no expirado
  const user = await User.findOneAndUpdate(
    {
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
      activo: true,
    },
    { $unset: { resetPasswordToken: 1, resetPasswordExpires: 1 } },
    { new: true, runValidators: true },
  );

  if (!user) {
    return next(new AppError('Token inválido o expirado', 400, ErrorCodes.INVALID_RESET_TOKEN));
  }

  // Actualizar password y limpiar token
  user.password = password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();

  await sendTokenResponse(user, 200, res, 'Contraseña restablecida correctamente. ¡Bienvenida de vuelta!');
});