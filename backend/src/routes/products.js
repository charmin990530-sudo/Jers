import { Router } from 'express';
import {
  getProducts,
  getProduct,
  getFeaturedProducts,
  getPromoProducts,
  getCategories,
  getBrands,
  getProductsByCategory,
  searchProducts,
} from '../controllers/productController.js';
import { validateQuery, validateParams, schemas } from '../middleware/validation.js';
import { optionalAuth } from '../middleware/auth.js';
import { z } from 'zod';

const router = Router();

router.use(optionalAuth);

router.get('/featured', getFeaturedProducts);
router.get('/promociones', getPromoProducts);
router.get('/categorias', getCategories);
router.get('/marcas', getBrands);
router.get('/buscar', validateQuery(schemas.productQuery), searchProducts);
router.get('/categoria/:slug', validateQuery(schemas.categoryQuery), getProductsByCategory);
router.get('/', validateQuery(schemas.productQuery), getProducts);
// El :id se valida como ObjectId ANTES de llegar al controller. Sin esto, un id
// malformato producia un CastError de Mongoose (500) en vez de un 400 limpio,
// que es ademas inconsistente con /api/admin/* y /api/users/*, que si validan.
router.get('/:id', validateParams(z.object({ id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID de producto inválido') })), getProduct);

export default router;