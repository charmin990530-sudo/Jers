import { Router } from 'express';
import {
  getUsers,
  getUser,
  updateUserRole,
  toggleUserActive,
  deleteUser,
} from '../controllers/userController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate, validateQuery, validateParams, schemas } from '../middleware/validation.js';
import { z } from 'zod';

const router = Router();

router.use(authenticate, authorize('admin'));

const idParam = z.object({ id: z.string().regex(/^[0-9a-fA-F]{24}$/) });

router.get('/', validateQuery(schemas.userQuery), getUsers);
router.get('/:id', validateParams(idParam), getUser);
router.patch('/:id/role', validateParams(idParam), validate(schemas.updateUserRole), updateUserRole);
router.patch('/:id/toggle-active', validateParams(idParam), validate(schemas.toggleUserActive), toggleUserActive);
router.delete('/:id', validateParams(idParam), deleteUser);

export default router;