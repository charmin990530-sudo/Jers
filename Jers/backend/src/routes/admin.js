import { Router } from 'express';
import {
  createProduct,
  updateProduct,
  deleteProduct,
  createCategory,
  updateCategory,
  deleteCategory,
  createBrand,
  updateBrand,
  deleteBrand,
  getDashboardStats,
  getAdminProducts,
  getAdminCategories,
  getAdminBrands,
  checkCategoryProducts,
  checkBrandProducts,
  getAdminOrders,
  getAdminOrder,
  updateAdminOrder,
} from '../controllers/adminController.js';
import { getContacts, updateContact } from '../controllers/contactController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate, schemas, validateParams, validateQuery } from '../middleware/validation.js';
import { z } from 'zod';

const router = Router();
const idParam = z.object({ id: z.string().regex(/^[0-9a-fA-F]{24}$/) });

router.use(authenticate, authorize('admin'));

router.get('/dashboard', getDashboardStats);
router.get('/productos', validateQuery(schemas.productQuery), getAdminProducts);
router.get('/categorias', getAdminCategories);
router.get('/marcas', getAdminBrands);
router.get('/pedidos', validateQuery(schemas.adminOrderQuery), getAdminOrders);
router.get('/pedidos/:id', validateParams(idParam), getAdminOrder);
router.patch('/pedidos/:id', validateParams(idParam), validate(schemas.updateAdminOrder), updateAdminOrder);
router.get('/contactos', validateQuery(schemas.contactQuery), getContacts);
router.patch('/contactos/:id', validateParams(idParam), validate(schemas.updateContact), updateContact);

router.post('/productos', validate(schemas.createProduct), createProduct);
router.patch('/productos/:id', validateParams(idParam), validate(schemas.updateProduct), updateProduct);
router.delete('/productos/:id', validateParams(idParam), deleteProduct);

router.post('/categorias', validate(schemas.createCategory), createCategory);
router.patch('/categorias/:id', validateParams(idParam), validate(schemas.updateCategory), updateCategory);
router.delete('/categorias/:id', validateParams(idParam), deleteCategory);
router.get('/categorias/:id/check-products', validateParams(idParam), checkCategoryProducts);

router.post('/marcas', validate(schemas.createBrand), createBrand);
router.patch('/marcas/:id', validateParams(idParam), validate(schemas.updateBrand), updateBrand);
router.delete('/marcas/:id', validateParams(idParam), deleteBrand);
router.get('/marcas/:id/check-products', validateParams(idParam), checkBrandProducts);

export default router;