import { Router } from 'express';
import {
  createOrder,
  getOrders,
  getOrder,
  cancelOrder,
} from '../controllers/orderController.js';
import { authenticate } from '../middleware/auth.js';
import { validate, schemas, validateParams, validateQuery } from '../middleware/validation.js';
import { z } from 'zod';

const router = Router();

router.use(authenticate);

router.post('/', validate(schemas.createOrder), createOrder);
router.get('/', validateQuery(schemas.orderQuery), getOrders);
router.get('/:id', validateParams(z.object({ id: z.string().regex(/^[0-9a-fA-F]{24}$/) })), getOrder);
router.patch('/:id/cancelar', validateParams(z.object({ id: z.string().regex(/^[0-9a-fA-F]{24}$/) })), validate(schemas.cancelOrder), cancelOrder);

export default router;