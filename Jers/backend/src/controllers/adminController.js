/**
 * adminController.js - Controladores de Administración
 * 
 * RUTAS ASOCIADAS (routes/admin.js) - TODAS PROTEGIDAS (authenticate + authorize('admin')):
 * GET    /api/admin/dashboard           -> getDashboardStats
 * POST   /api/admin/productos           -> createProduct
 * PATCH  /api/admin/productos/:id       -> updateProduct
 * DELETE /api/admin/productos/:id       -> deleteProduct
 * POST   /api/admin/categorias          -> createCategory
 * PATCH  /api/admin/categorias/:id      -> updateCategory
 * DELETE /api/admin/categorias/:id      -> deleteCategory
 * POST   /api/admin/marcas              -> createBrand
 * PATCH  /api/admin/marcas/:id          -> updateBrand
 * DELETE /api/admin/marcas/:id          -> deleteBrand
 * 
 * VALIDACIÓN:
 * - createProduct/updateProduct: schemas.createProduct/updateProduct (Zod)
 * - Categorías/Marcas: validación inline en routes/admin.js
 */

import { Product, Category, Brand, User, Order } from '../models/index.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';

/**
 * POST /api/admin/productos
 * Crea producto nuevo (admin)
 * Body validado por schemas.createProduct
 * Auto-genera slug, sku, asegura imagen principal (modelo pre-save)
 */
export const createProduct = asyncHandler(async (req, res) => {
  const product = await Product.create(req.body);
  await product.populate(['categoria', 'marca']);
  res.status(201).json({ success: true, message: 'Producto creado', product });
});

/**
 * PATCH /api/admin/productos/:id
 * Actualiza producto (admin)
 * new: true = devuelve actualizado
 * runValidators: true = valida schema Mongoose
 */
export const updateProduct = asyncHandler(async (req, res, next) => {
  const product = await Product.findById(req.params.id);
  if (!product) {
    return next(new AppError('Producto no encontrado', 404, 'PRODUCT_NOT_FOUND'));
  }
  Object.assign(product, req.body);
  await product.save();
  await product.populate(['categoria', 'marca']);
  res.status(200).json({ success: true, message: 'Producto actualizado', product });
});

/**
 * DELETE /api/admin/productos/:id
 * Elimina producto (hard delete)
 * Considerar soft delete (activo: false) en lugar de eliminar
 */
export const deleteProduct = asyncHandler(async (req, res, next) => {
  const product = await Product.findById(req.params.id);
  if (!product) {
    return next(new AppError('Producto no encontrado', 404, 'PRODUCT_NOT_FOUND'));
  }
  product.activo = false;
  await product.save();
  res.status(200).json({ success: true, message: 'Producto desactivado' });
});

/**
 * POST /api/admin/categorias
 * Crea categoría (admin)
 * Enum fijo en modelo: rostro, ojos, labios, shampoo, acondicionador, tratamientos
 */
export const createCategory = asyncHandler(async (req, res) => {
  const category = await Category.create(req.body);
  res.status(201).json({ success: true, message: 'Categoría creada', category });
});

/**
 * PATCH /api/admin/categorias/:id
 * Actualiza categoría
 */
export const updateCategory = asyncHandler(async (req, res, next) => {
  const category = await Category.findById(req.params.id);
  if (!category) {
    return next(new AppError('Categoría no encontrada', 404, 'CATEGORY_NOT_FOUND'));
  }
  Object.assign(category, req.body);
  await category.save();
  res.status(200).json({ success: true, message: 'Categoría actualizada', category });
});

/**
 * DELETE /api/admin/categorias/:id
 * Elimina categoría SOLO si no tiene productos asociados
 * Previene orphan products
 */
export const deleteCategory = asyncHandler(async (req, res, next) => {
  const productsCount = await Product.countDocuments({ categoria: req.params.id });
  if (productsCount > 0) {
    return next(new AppError('No se puede eliminar una categoría con productos asociados', 400, 'CATEGORY_HAS_PRODUCTS'));
  }
  const category = await Category.findById(req.params.id);
  if (!category) {
    return next(new AppError('Categoría no encontrada', 404, 'CATEGORY_NOT_FOUND'));
  }
  category.activo = false;
  await category.save();
  res.status(200).json({ success: true, message: 'Categoría desactivada' });
});

/**
 * POST /api/admin/marcas
 * Crea marca (admin)
 */
export const createBrand = asyncHandler(async (req, res) => {
  const brand = await Brand.create(req.body);
  res.status(201).json({ success: true, message: 'Marca creada', brand });
});

/**
 * PATCH /api/admin/marcas/:id
 * Actualiza marca
 */
export const updateBrand = asyncHandler(async (req, res, next) => {
  const brand = await Brand.findById(req.params.id);
  if (!brand) {
    return next(new AppError('Marca no encontrada', 404, 'BRAND_NOT_FOUND'));
  }
  Object.assign(brand, req.body);
  await brand.save();
  res.status(200).json({ success: true, message: 'Marca actualizada', brand });
});

/**
 * DELETE /api/admin/marcas/:id
 * Elimina marca SOLO si no tiene productos asociados
 */
export const deleteBrand = asyncHandler(async (req, res, next) => {
  const productsCount = await Product.countDocuments({ marca: req.params.id });
  if (productsCount > 0) {
    return next(new AppError('No se puede eliminar una marca con productos asociados', 400, 'BRAND_HAS_PRODUCTS'));
  }
  const brand = await Brand.findById(req.params.id);
  if (!brand) {
    return next(new AppError('Marca no encontrada', 404, 'BRAND_NOT_FOUND'));
  }
  brand.activo = false;
  await brand.save();
  res.status(200).json({ success: true, message: 'Marca desactivada' });
});

/**
 * GET /api/admin/dashboard
 * Estadísticas para panel de administración
 * Paraleliza: conteos + agregaciones
 */
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildAdminProductFilter = (query) => {
  const filter = {};
  if (query.activo !== undefined) filter.activo = query.activo;
  if (query.categoria) filter.categoria = query.categoria;
  if (query.marca) filter.marca = query.marca;
  if (query.enPromocion !== undefined) filter.enPromocion = query.enPromocion;
  if (query.destacado !== undefined) filter.destacado = query.destacado;
  if (query.search) {
    const search = escapeRegex(query.search);
    filter.$or = [
      { nombre: { $regex: search, $options: 'i' } },
      { descripcion: { $regex: search, $options: 'i' } },
      { sku: { $regex: search, $options: 'i' } },
    ];
  }
  return filter;
};

export const getAdminProducts = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, sort = 'nuevos' } = req.query;
  const filter = buildAdminProductFilter(req.query);
  const sortOptions = {
    nuevos: { createdAt: -1 },
    mas_vendidos: { vendidos: -1, createdAt: -1 },
    precio_asc: { precio: 1 },
    precio_desc: { precio: -1 },
  };
  const [products, total] = await Promise.all([
    Product.find(filter)
      .populate('categoria', 'nombre slug activo')
      .populate('marca', 'nombre slug logo activo')
      .sort(sortOptions[sort] || sortOptions.nuevos)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Product.countDocuments(filter),
  ]);
  res.status(200).json({ success: true, count: products.length, total, page, pages: Math.ceil(total / limit), products });
});

export const getAdminCategories = asyncHandler(async (req, res) => {
  const categories = await Category.find({}).sort({ orden: 1, nombre: 1 }).lean();
  res.status(200).json({ success: true, count: categories.length, categories });
});

export const getAdminBrands = asyncHandler(async (req, res) => {
  const brands = await Brand.find({}).sort({ orden: 1, nombre: 1 }).lean();
  res.status(200).json({ success: true, count: brands.length, brands });
});

export const checkCategoryProducts = asyncHandler(async (req, res, next) => {
  const productsCount = await Product.countDocuments({ categoria: req.params.id });
  res.status(200).json({ success: true, hasProducts: productsCount > 0, productsCount });
});

export const checkBrandProducts = asyncHandler(async (req, res) => {
  const productsCount = await Product.countDocuments({ marca: req.params.id });
  res.status(200).json({ success: true, hasProducts: productsCount > 0, productsCount });
});

export const getAdminOrders = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, estado, estadoPago } = req.query;
  const filter = {};
  if (estado) filter.estado = estado;
  if (estadoPago) filter.estadoPago = estadoPago;
  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate('usuario', 'nombre apellido email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean({ virtuals: true }),
    Order.countDocuments(filter),
  ]);
  res.status(200).json({ success: true, count: orders.length, total, page, pages: Math.ceil(total / limit), orders });
});

export const getAdminOrder = asyncHandler(async (req, res, next) => {
  const order = await Order.findById(req.params.id)
    .populate('usuario', 'nombre apellido email telefono')
    .lean({ virtuals: true });
  if (!order) return next(new AppError('Pedido no encontrado', 404, 'ORDER_NOT_FOUND'));
  res.status(200).json({ success: true, order });
});

export const updateAdminOrder = asyncHandler(async (req, res, next) => {
  let order = await Order.findById(req.params.id);
  if (!order) return next(new AppError('Pedido no encontrado', 404, 'ORDER_NOT_FOUND'));

  const previousEstado = order.estado;
  const nextEstado = req.body.estado || previousEstado;
  const transitions = {
    pendiente: ['confirmado', 'cancelado'],
    confirmado: ['procesando', 'cancelado'],
    procesando: ['enviado', 'cancelado'],
    enviado: ['entregado'],
    entregado: ['reembolsado'],
    cancelado: [],
    reembolsado: [],
  };
  if (nextEstado !== previousEstado && !transitions[previousEstado]?.includes(nextEstado)) {
    return next(new AppError('Transición de estado no permitida', 400, 'INVALID_ORDER_TRANSITION'));
  }
  if (nextEstado === 'cancelado' && (order.estadoPago === 'pagado' || req.body.estadoPago === 'pagado')) {
    return next(new AppError('Un pedido pagado debe reembolsarse, no cancelarse', 409, 'PAID_ORDER_REQUIRES_REFUND'));
  }

  if (nextEstado === 'cancelado' && previousEstado !== 'cancelado') {
    const updated = await Order.findOneAndUpdate(
      { _id: order._id, estado: previousEstado },
      {
        $set: {
          ...req.body,
          estado: 'cancelado',
          canceladoEn: new Date(),
          motivoCancelacion: 'Cancelado por administración',
        },
      },
      { new: true, runValidators: true },
    );
    if (!updated) return next(new AppError('El pedido cambió simultáneamente; intente de nuevo', 409, 'ORDER_STATE_CHANGED'));
    order = updated;
    for (const item of order.items) {
      await Product.updateOne({ _id: item.producto }, { $inc: { stock: item.cantidad, vendidos: -item.cantidad } });
    }
  } else {
    Object.assign(order, req.body);
    if (nextEstado === 'enviado' && !order.fechaEnvio) order.fechaEnvio = new Date();
    if (nextEstado === 'entregado' && !order.fechaEntrega) order.fechaEntrega = new Date();
    await order.save();
  }
  await order.populate('usuario', 'nombre apellido email telefono');
  res.status(200).json({ success: true, message: 'Pedido actualizado', order });
});
export const getDashboardStats = asyncHandler(async (req, res) => {
  const [totalUsers, totalProducts, totalOrders, recentOrders] = await Promise.all([
    User.countDocuments(),
    Product.countDocuments(),
    Order.countDocuments(),
    Order.find().sort({ createdAt: -1 }).limit(5).populate('usuario', 'nombre apellido email').lean(),
  ]);

  // Agregación: pedidos por estado
  const ordersByStatus = await Order.aggregate([
    { $group: { _id: '$estado', count: { $sum: 1 } } },
  ]);

  // Agregación: revenue total (solo pagados)
  const totalRevenue = await Order.aggregate([
    { $match: { estadoPago: 'pagado' } },
    { $group: { _id: null, total: { $sum: '$total' } } },
  ]);

  res.status(200).json({
    success: true,
    stats: {
      totalUsers,
      totalProducts,
      totalOrders,
      totalRevenue: totalRevenue[0]?.total || 0,
      ordersByStatus: ordersByStatus.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      recentOrders,
    },
  });
});