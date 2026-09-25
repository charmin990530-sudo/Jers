/**
 * productController.js - Controladores Públicos de Productos
 * 
 * RUTAS ASOCIADAS (routes/products.js):
 * GET /api/products                    -> getProducts (listado con filtros, paginación)
 * GET /api/products/featured           -> getFeaturedProducts (home: destacados)
 * GET /api/products/promociones        -> getPromoProducts (home: ofertas)
 * GET /api/products/categorias         -> getCategories (lista categorías)
 * GET /api/products/marcas             -> getBrands (lista marcas)
 * GET /api/products/buscar             -> searchProducts (búsqueda full-text)
 * GET /api/products/categoria/:slug    -> getProductsByCategory (filtro por categoría)
 * GET /api/products/:id                -> getProduct (detalle producto)
 * 
 * TODAS SON PÚBLICAS (optionalAuth en router para saber si hay user logueado)
 * 
 * QUERY PARAMS COMUNES (validados por schemas.productQuery):
 * - page, limit: paginación
 * - categoria, marca: ObjectId para filtrar
 * - search: texto para búsqueda full-text
 * - minPrice, maxPrice: rango de precios
 * - enPromocion, destacado: boolean
 * - sort: 'nuevos' | 'mas_vendidos' | 'precio_asc' | 'precio_desc' | 'descuento'
 * 
 * PERFORMANCE:
 * - .lean() para objetos JS planos (más rápido, sin métodos Mongoose)
 * - populate selectivo (solo campos necesarios)
 * - Promise.all para queries paralelas
 * - Índices en BD para filtros comunes
 */

import { Product, Category, Brand } from '../models/index.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';

/**
 * Construye filtro MongoDB desde query params
 * Siempre incluye activo: true (soft delete)
 * @param {Object} query - req.query validado
 * @returns {Object} Filtro MongoDB
 */
const buildFilter = (query) => {
  const filter = { activo: true };  // Base: solo productos activos

  // Filtros exactos por ObjectId
  if (query.categoria) filter.categoria = query.categoria;
  if (query.marca) filter.marca = query.marca;
  
  // Filtros booleanos
  if (query.enPromocion !== undefined) filter.enPromocion = query.enPromocion;
  if (query.destacado !== undefined) filter.destacado = query.destacado;


  // Rango de precios
  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    filter.precio = {};
    if (query.minPrice !== undefined) filter.precio.$gte = query.minPrice;
    if (query.maxPrice !== undefined) filter.precio.$lte = query.maxPrice;
  }

  // Búsqueda full-text (requiere índice text en nombre + descripcion)
  if (query.search) {
    filter.$text = { $search: query.search };
  }

  return filter;
};

/**
 * Construye ordenamiento MongoDB desde string
 * @param {String} sort - 'nuevos' | 'mas_vendidos' | 'precio_asc' | 'precio_desc' | 'descuento'
 * @returns {Object} Sort MongoDB
 */
const buildSort = (sort) => {
  switch (sort) {
    case 'mas_vendidos': return { vendidos: -1, createdAt: -1 };  // Más vendidos, luego nuevos
    case 'precio_asc': return { precio: 1 };
    case 'precio_desc': return { precio: -1 };
    case 'descuento': return { precioAnterior: -1, precio: 1 };   // Mayor descuento primero
    case 'nuevos':
    default: return { createdAt: -1 };                            // Más recientes primero
  }
};

/**
 * GET /api/products
 * Listado paginado con filtros combinados
 * Query validado por schemas.productQuery (validateQuery middleware)
 */
export const getProducts = asyncHandler(async (req, res) => {
  const { page = 1, limit = 12, ...filters } = req.query;
  const skip = (page - 1) * limit;

  const filter = buildFilter(filters);
  const sort = buildSort(filters.sort);

  // Paraleliza: data + count total
  const [products, total] = await Promise.all([
    Product.find(filter)
      .populate('categoria', 'nombre slug')           // Solo campos necesarios
      .populate('marca', 'nombre slug logo')
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean({ virtuals: true }),                                        // Objetos planos con virtuals
    Product.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    count: products.length,
    total,
    page: Number(page),
    pages: Math.ceil(total / limit),  // Total páginas para paginación frontend
    products,
  });
});

/**
 * GET /api/products/:id
 * Detalle completo de producto
 * Popula categoría y marca con más campos (para ficha técnica)
 */
export const getProduct = asyncHandler(async (req, res, next) => {
  const product = await Product.findById(req.params.id)
    .populate('categoria', 'nombre slug')
    .populate('marca', 'nombre slug logo descripcion');

  // Verifica existencia Y que esté activo
  if (!product || !product.activo) {
    return next(new AppError('Producto no encontrado', 404, 'PRODUCT_NOT_FOUND'));
  }

  res.status(200).json({
    success: true,
    product,
  });
});

/**
 * GET /api/products/featured
 * Productos destacados para home (máx 8)
 * Usado en index.html -> js/index.js -> renderizarPromociones
 */
export const getFeaturedProducts = asyncHandler(async (req, res) => {
  const products = await Product.find({ destacado: true, activo: true })
    .populate('categoria', 'nombre slug')
    .populate('marca', 'nombre slug logo')
    .sort({ createdAt: -1 })
    .limit(8)
    .lean({ virtuals: true });

  res.status(200).json({
    success: true,
    count: products.length,
    products,
  });
});

/**
 * GET /api/products/promociones
 * Productos en promoción para home (máx 12)
 */
export const getPromoProducts = asyncHandler(async (req, res) => {
  const products = await Product.find({ enPromocion: true, activo: true })
    .populate('categoria', 'nombre slug')
    .populate('marca', 'nombre slug logo')
    .sort({ createdAt: -1 })
    .limit(12)
    .lean({ virtuals: true });

  res.status(200).json({
    success: true,
    count: products.length,
    products,
  });
});

/**
 * GET /api/products/categorias
 * Lista todas las categorías activas ordenadas
 * Usado en tabs de maquillaje.html y cabello.html
 */
export const getCategories = asyncHandler(async (req, res) => {
  const categories = await Category.find({ activo: true })
    .sort({ orden: 1, nombre: 1 })  // Por orden numérico, luego alfabético
    .lean();

  res.status(200).json({
    success: true,
    count: categories.length,
    categories,
  });
});

/**
 * GET /api/products/marcas
 * Lista todas las marcas activas ordenadas
 * Usado en carrusel home y filtros
 */
export const getBrands = asyncHandler(async (req, res) => {
  const brands = await Brand.find({ activo: true })
    .sort({ orden: 1, nombre: 1 })
    .lean();

  res.status(200).json({
    success: true,
    count: brands.length,
    brands,
  });
});

/**
 * GET /api/products/categoria/:slug
 * Productos filtrados por categoría (via slug URL amigable)
 * Ej: /api/products/categoria/rostro
 */
export const getProductsByCategory = asyncHandler(async (req, res, next) => {
  const { slug } = req.params;
  const { page = 1, limit = 12, sort = 'nuevos' } = req.query;

  // Busca categoría por slug
  const category = await Category.findOne({ slug, activo: true });
  if (!category) {
    return next(new AppError('Categoría no encontrada', 404, 'CATEGORY_NOT_FOUND'));
  }

  const skip = (page - 1) * limit;
  const filter = { categoria: category._id, activo: true };

  const [products, total] = await Promise.all([
    Product.find(filter)
      .populate('marca', 'nombre slug logo')
      .sort(buildSort(sort))
      .skip(skip)
      .limit(limit)
      .lean(),
    Product.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    category: { nombre: category.nombre, slug: category.slug },
    count: products.length,
    total,
    page: Number(page),
    pages: Math.ceil(total / limit),
    products,
  });
});

/**
 * GET /api/products/buscar
 * Búsqueda full-text en nombre + descripcion
 * Requiere índice text en Product (ver modelo)
 * Mínimo 2 caracteres para evitar queries muy amplias
 */
export const searchProducts = asyncHandler(async (req, res) => {
  const { q, page = 1, limit = 12 } = req.query;

  // Validación mínima: query muy corta
  if (!q || q.trim().length < 2) {
    return res.status(200).json({
      success: true,
      count: 0,
      total: 0,
      page: 1,
      pages: 0,
      products: [],
    });
  }

  const skip = (page - 1) * limit;
  const filter = {
    activo: true,
    $text: { $search: q.trim() },  // MongoDB text search
  };

  // Ordena por score de relevancia (textScore)
  const [products, total] = await Promise.all([
    Product.find(filter, { score: { $meta: 'textScore' } })
      .populate('categoria', 'nombre slug')
      .populate('marca', 'nombre slug logo')
      .sort({ score: { $meta: 'textScore' } })
      .skip(skip)
      .limit(limit)
      .lean(),
    Product.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    query: q,
    count: products.length,
    total,
    page: Number(page),
    pages: Math.ceil(total / limit),
    products,
  });
});