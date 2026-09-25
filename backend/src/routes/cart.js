import { Router } from 'express';
import {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
} from '../controllers/cartController.js';
import { authenticate } from '../middleware/auth.js';
import { validate, schemas, validateParams } from '../middleware/validation.js';
import { z } from 'zod';

const router = Router();

router.use(authenticate);

router.get('/', getCart);
router.post('/', validate(schemas.addToCart), addToCart);
router.patch('/:itemId', validateParams(z.object({ itemId: z.string().regex(/^[0-9a-fA-F]{24}$/) })), validate(schemas.updateCartItem), updateCartItem);
router.delete('/:itemId', validateParams(z.object({ itemId: z.string().regex(/^[0-9a-fA-F]{24}$/) })), removeFromCart);
router.delete('/', clearCart);

export default router;