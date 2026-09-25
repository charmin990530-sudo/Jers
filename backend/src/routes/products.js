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
import { validateQuery, schemas } from '../middleware/validation.js';
import { optionalAuth } from '../middleware/auth.js';

const router = Router();

router.use(optionalAuth);

router.get('/featured', getFeaturedProducts);
router.get('/promociones', getPromoProducts);
router.get('/categorias', getCategories);
router.get('/marcas', getBrands);
router.get('/buscar', validateQuery(schemas.productQuery), searchProducts);
router.get('/categoria/:slug', validateQuery(schemas.categoryQuery), getProductsByCategory);
router.get('/', validateQuery(schemas.productQuery), getProducts);
router.get('/:id', getProduct);

export default router;