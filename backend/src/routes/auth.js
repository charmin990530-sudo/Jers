import { Router } from 'express';
import {
  register,
  login,
  logout,
  getMe,
  updateProfile,
  changePassword,
  addAddress,
  updateAddress,
  deleteAddress,
  forgotPassword,
  getCsrfToken,
  resetPassword,
} from '../controllers/authController.js';
import { authenticate, optionalAuth } from '../middleware/auth.js';
import { validate, schemas, validateParams } from '../middleware/validation.js';
import { z } from 'zod';

const router = Router();

// ==========================================
// RUTAS PÚBLICAS (sin autenticación)
// ==========================================
router.post('/register', validate(schemas.register), register);
router.post('/login', validate(schemas.login), login);
router.post('/logout', optionalAuth, logout);

router.get('/csrf', getCsrfToken);

// Password reset flow (públicas)
router.post('/forgot-password', validate(schemas.forgotPassword), forgotPassword);
router.post('/reset-password', validate(schemas.resetPassword), resetPassword);

// ==========================================
// RUTAS PROTEGIDAS (requieren autenticación)
// ==========================================
router.use(authenticate);

router.get('/me', getMe);
router.patch('/profile', validate(schemas.updateProfile), updateProfile);
router.patch('/password', validate(schemas.changePassword), changePassword);

router.post('/addresses', validate(schemas.addAddress), addAddress);
router.patch('/addresses/:addressId', validateParams(z.object({ addressId: z.string().regex(/^[0-9a-fA-F]{24}$/) })), validate(schemas.updateAddress), updateAddress);
router.delete('/addresses/:addressId', validateParams(z.object({ addressId: z.string().regex(/^[0-9a-fA-F]{24}$/) })), deleteAddress);

export default router;