import mongoose from 'mongoose';
import { User, Category, Brand, Product } from '../models/index.js';
import { connectDB } from '../config/db.js';
import { MONGODB_URI, NODE_ENV } from '../config/env.js';

const categoriesData = [
  { nombre: 'rostro', slug: 'rostro', descripcion: 'Bases, correctores, polvos y primers', orden: 1 },
  { nombre: 'ojos', slug: 'ojos', descripcion: 'Sombras, delineadores, máscaras', orden: 2 },
  { nombre: 'labios', slug: 'labios', descripcion: 'Labiales, gloss, delineadores de labios', orden: 3 },
  { nombre: 'shampoo', slug: 'shampoo', descripcion: 'Shampoos para todo tipo de cabello', orden: 4 },
  { nombre: 'acondicionador', slug: 'acondicionador', descripcion: 'Acondicionadores y mascarillas', orden: 5 },
  { nombre: 'tratamientos', slug: 'tratamientos', descripcion: 'Tratamientos capilares, keratina, ampolletas', orden: 6 },
];

const brandsData = [
  { nombre: 'Atenea Profesional', slug: 'atenea-profesional', descripcion: 'Marca profesional de maquillaje y cuidado capilar', orden: 1 },
  { nombre: "L'Bel", slug: 'lbel', descripcion: 'Marca reconocida de cosméticos y cuidado personal', orden: 2 },
  { nombre: 'Jorge de la Garza', slug: 'jorge-de-la-garza', descripcion: 'Marca de maquillaje profesional', orden: 3 },
  { nombre: 'Maybelline', slug: 'maybelline', descripcion: 'Marca global de maquillaje', orden: 4 },
  { nombre: "L'Oréal Paris", slug: 'loreal-paris', descripcion: 'Marca líder en belleza', orden: 5 },
  { nombre: 'MAC', slug: 'mac', descripcion: 'Marca profesional de maquillaje', orden: 6 },
];

const productsData = [
  {
    nombre: 'Base Atenea',
    descripcion: 'Base de maquillaje profesional de alta cobertura con acabado natural. Contiene ácido hialurónico y FPS 15 para hidratar y proteger la piel.',
    descripcionCorta: 'Base profesional alta cobertura con FPS 15',
    precio: 58000,
    precioAnterior: 68000,
    stock: 50,
    categoria: 'rostro',
    marca: 'atenea-profesional',
    imagenes: [
      { url: '/img/productos/base-atenea.webp', alt: 'Base Atenea', esPrincipal: true, posicion: 'center 80%' },
    ],
    ingredientes: [
      { nombre: 'Ácido hialurónico', descripcion: 'Hidratación profunda' },
      { nombre: 'Pigmentos minerales', descripcion: 'Cobertura natural' },
      { nombre: 'FPS 15', descripcion: 'Protección solar' },
    ],
    uso: 'Aplicar sobre piel limpia e hidratada con brocha o esponja difuminando desde el centro hacia afuera.',
    destacado: true,
    enPromocion: true,
  },
  {
    nombre: 'Corrector Atenea',
    descripcion: 'Corrector de alta cobertura para ojeras e imperfecciones. Fórmula con vitamina E que no marca líneas de expresión.',
    descripcionCorta: 'Corrector alta cobertura con vitamina E',
    precio: 38000,
    stock: 40,
    categoria: 'rostro',
    marca: 'atenea-profesional',
    imagenes: [
      { url: '/img/productos/corrector-atenea.webp', alt: 'Corrector Atenea', esPrincipal: true, posicion: 'center 50%' },
    ],
    ingredientes: [
      { nombre: 'Vitamina E', descripcion: 'Antioxidante y nutritivo' },
      { nombre: 'Pigmentos de alta cobertura', descripcion: 'Cubre imperfecciones' },
    ],
    uso: 'Aplicar en zona de ojeras e imperfecciones y difuminar con golpecitos suaves.',
    destacado: true,
  },
  {
    nombre: "Base Matte L'Bel",
    descripcion: 'Base matte de larga duración con control de brillo. Ideal para piel mixta a grasa.',
    descripcionCorta: 'Base matte larga duración control brillo',
    precio: 62000,
    stock: 35,
    categoria: 'rostro',
    marca: 'lbel',
    imagenes: [
      { url: '/img/productos/base-matte-lbel.webp', alt: "Base Matte L'Bel", esPrincipal: true, posicion: 'center 50%' },
    ],
    ingredientes: [
      { nombre: 'Polvo de sílice', descripcion: 'Control de brillo' },
      { nombre: 'Pigmentos micronizados', descripcion: 'Acabado natural' },
    ],
    uso: 'Aplicar con brocha kabuki para mejor cobertura mate.',
    enPromocion: false,
  },
  {
    nombre: 'Sombras Atenea',
    descripcion: 'Paleta de sombras profesionales con 9 tonos mate y shimmer. Alta pigmentación y larga duración.',
    descripcionCorta: 'Paleta 9 sombras mate y shimmer',
    precio: 45000,
    precioAnterior: 55000,
    stock: 30,
    categoria: 'ojos',
    marca: 'atenea-profesional',
    imagenes: [
      { url: '/img/productos/sombras-atenea.webp', alt: 'Sombras Atenea', esPrincipal: true, posicion: 'center 50%' },
    ],
    ingredientes: [
      { nombre: 'Mica', descripcion: 'Efecto shimmer' },
      { nombre: 'Talco cosmético', descripcion: 'Textura sedosa' },
      { nombre: 'Pigmentos de alta intensidad', descripcion: 'Color vibrante' },
    ],
    uso: 'Aplicar con pincel de sombras. Usar tonos mates en cuenca y shimmer en párpado móvil.',
    destacado: true,
    enPromocion: true,
  },
  {
    nombre: 'Delineador en Gel JDG',
    descripcion: 'Delineador en gel de larga duración, resistente al agua y al sudor. Punta precisa para trazos definidos.',
    descripcionCorta: 'Delineador gel resistente al agua',
    precio: 34000,
    stock: 45,
    categoria: 'ojos',
    marca: 'jorge-de-la-garza',
    imagenes: [
      { url: '/img/productos/delineador-en-gel-jdg.webp', alt: 'Delineador en Gel JDG', esPrincipal: true, posicion: 'center 90%' },
    ],
    ingredientes: [
      { nombre: 'Ceras naturales', descripcion: 'Textura cremosa' },
      { nombre: 'Pigmentos de larga duración', descripcion: 'No se corre' },
    ],
    uso: 'Aplicar con pincel biselado junto a la línea de pestañas.',
  },
  {
    nombre: 'Lip Gloss',
    descripcion: 'Brillo labial hidratante con efecto volumen. No pegajoso, con aceites nutritivos.',
    descripcionCorta: 'Gloss hidratante efecto volumen',
    precio: 32000,
    stock: 60,
    categoria: 'labios',
    marca: 'atenea-profesional',
    imagenes: [
      { url: '/img/productos/lip-gloss.webp', alt: 'Lip Gloss', esPrincipal: true, posicion: '30% 75%' },
    ],
    ingredientes: [
      { nombre: 'Manteca de karité', descripcion: 'Nutrición intensa' },
      { nombre: 'Vitamina E', descripcion: 'Protección antioxidante' },
      { nombre: 'Aceite de jojoba', descripcion: 'Hidratación' },
    ],
    uso: 'Aplicar directamente sobre labios limpios. Reaplicar según deseo.',
    destacado: true,
  },
  {
    nombre: "Labial Mate L'Bel",
    descripcion: 'Labial mate de alta pigmentación y larga duración. Fórmula confortable que no reseca.',
    descripcionCorta: 'Labial mate larga duración confortable',
    precio: 36000,
    precioAnterior: 42000,
    stock: 40,
    categoria: 'labios',
    marca: 'lbel',
    imagenes: [
      { url: '/img/productos/labial-mate-lbl.webp', alt: "Labial Mate L'Bel", esPrincipal: true, posicion: 'center 90%' },
    ],
    ingredientes: [
      { nombre: 'Manteca de karité', descripcion: 'Hidratación' },
      { nombre: 'Vitamina E', descripcion: 'Antioxidante' },
      { nombre: 'Pigmentos puros', descripcion: 'Color intenso' },
    ],
    uso: 'Aplicar sobre labios exfoliados e hidratados para mejor acabado.',
    enPromocion: true,
  },
  {
    nombre: 'Shampoo Hidratación Profunda',
    descripcion: 'Shampoo profesional con keratina, argán y aloe vera. Limpia suavemente mientras hidrata intensamente.',
    descripcionCorta: 'Shampoo con keratina, argán y aloe vera',
    precio: 46000,
    precioAnterior: 52000,
    stock: 55,
    categoria: 'shampoo',
    marca: 'atenea-profesional',
    imagenes: [
      { url: '/img/productos/shampoo-hidratacion-profunda.webp', alt: 'Shampoo Hidratación Profunda', esPrincipal: true },
    ],
    ingredientes: [
      { nombre: 'Keratina', descripcion: 'Fortalece la fibra capilar' },
      { nombre: 'Aceite de argán', descripcion: 'Nutrición y brillo' },
      { nombre: 'Aloe vera', descripcion: 'Hidratación y calma' },
    ],
    uso: 'Aplicar sobre cabello mojado, masajear y enjuagar. Repetir si necesario.',
    destacado: true,
    enPromocion: true,
  },
  {
    nombre: "Shampoo Anticaída L'Bel",
    descripcion: 'Shampoo fortalecedor con ingredientes activos que reducen la caída y estimulan el crecimiento.',
    descripcionCorta: 'Shampoo anticaída fortalecedor',
    precio: 52000,
    stock: 30,
    categoria: 'shampoo',
    marca: 'lbel',
    imagenes: [
      { url: '/img/productos/shampoo-anti-caida.webp', alt: "Shampoo Anticaída L'Bel", esPrincipal: true },
    ],
    ingredientes: [
      { nombre: 'Biotina', descripcion: 'Fortalece el cabello' },
      { nombre: 'Cafeína', descripcion: 'Estimula folículos' },
      { nombre: 'Ginseng', descripcion: 'Revitaliza' },
    ],
    uso: 'Masajear suavemente en cuero cabelludo, dejar actuar 2-3 minutos y enjuagar.',
  },
  {
    nombre: 'Shampoo Nutritivo JDG',
    descripcion: 'Shampoo nutritivo para cabello seco y dañado. Con proteínas de seda y pantenol.',
    descripcionCorta: 'Shampoo nutritivo proteínas de seda',
    precio: 41000,
    stock: 40,
    categoria: 'shampoo',
    marca: 'jorge-de-la-garza',
    imagenes: [
      { url: '/img/productos/shampoo-nutritivo.webp', alt: 'Shampoo Nutritivo JDG', esPrincipal: true },
    ],
    ingredientes: [
      { nombre: 'Proteínas de seda', descripcion: 'Suavidad y brillo' },
      { nombre: 'Pantenol', descripcion: 'Hidratación profunda' },
    ],
    uso: 'Aplicar sobre cabello húmedo, emulsionar y enjuagar abundantemente.',
  },
  {
    nombre: 'Acondicionador Reparador',
    descripcion: 'Acondicionador reparador para cabello dañado. Sella cutículas y restaura elasticidad.',
    descripcionCorta: 'Acondicionador reparador sella cutículas',
    precio: 46000,
    stock: 45,
    categoria: 'acondicionador',
    marca: 'atenea-profesional',
    imagenes: [
      { url: '/img/productos/acondicionador-reparador.webp', alt: 'Acondicionador Reparador', esPrincipal: true },
    ],
    ingredientes: [
      { nombre: 'Ceramidas', descripcion: 'Restauración de barrera' },
      { nombre: 'Queratina hidrolizada', descripcion: 'Fortalecimiento' },
    ],
    uso: 'Aplicar de medios a puntas tras el shampoo, dejar 3 minutos y enjuagar.',
  },
  {
    nombre: "Acondicionador Nutrición Intensa L'Bel",
    descripcion: 'Acondicionador nutritivo intenso para cabello muy seco. Nutre en profundidad.',
    descripcionCorta: 'Acondicionador nutrición intensa cabello seco',
    precio: 50000,
    stock: 35,
    categoria: 'acondicionador',
    marca: 'lbel',
    imagenes: [
      { url: '/img/productos/acondicionador-nutricion-intensa.webp', alt: "Acondicionador Nutrición Intensa L'Bel", esPrincipal: true },
    ],
    ingredientes: [
      { nombre: 'Manteca de karité', descripcion: 'Nutrición intensa' },
      { nombre: 'Aceite de coco', descripcion: 'Penetración en fibra' },
    ],
    uso: 'Distribuir uniformemente, dejar actuar 5 minutos y enjuagar con agua fría.',
  },
  {
    nombre: 'Tratamiento Control de Frizz',
    descripcion: 'Tratamiento profesional anti-frizz con keratina hidrolizada. Controla el encrespamiento por semanas.',
    descripcionCorta: 'Tratamiento anti-frizz con keratina',
    precio: 58000,
    stock: 25,
    categoria: 'tratamientos',
    marca: 'atenea-profesional',
    imagenes: [
      { url: '/img/productos/tratamiento-control-de-frizz.webp', alt: 'Tratamiento Control de Frizz', esPrincipal: true },
    ],
    ingredientes: [
      { nombre: 'Keratina hidrolizada', descripcion: 'Alisa y fortalece' },
      { nombre: 'Aceite de argán', descripcion: 'Brillo y nutrición' },
    ],
    uso: 'Aplicar tras lavar, dejar actuar 15-20 min con calor, enjuagar y secar.',
    destacado: true,
  },
  {
    nombre: 'Ampolletas de Keratina JDG',
    descripcion: 'Ampolletas concentradas de keratina para tratamiento intensivo. Reparación profunda en cada aplicación.',
    descripcionCorta: 'Ampolletas keratina tratamiento intensivo',
    precio: 39000,
    stock: 30,
    categoria: 'tratamientos',
    marca: 'jorge-de-la-garza',
    imagenes: [
      { url: '/img/productos/keratina-ampolleta.webp', alt: 'Ampolletas de Keratina JDG', esPrincipal: true, posicion: 'center 70%' },
    ],
    ingredientes: [
      { nombre: 'Keratina pura', descripcion: 'Reconstrucción capilar' },
      { nombre: 'Ácido hialurónico', descripcion: 'Hidratación' },
    ],
    uso: 'Aplicar ampolla completa en cabello lavado, masajear, dejar 10 min y enjuagar.',
  },
];

const promoProductsData = [
  {
    nombre: 'Paleta de Sombras Nude',
    descripcion: 'Paleta de sombras en tonos nude para looks naturales y sofisticados.',
    descripcionCorta: 'Paleta de sombras en tonos nude',
    precio: 45000,
    precioAnterior: 58000,
    stock: 20,
    categoria: 'ojos',
    marca: 'atenea-profesional',
    imagenes: [
      { url: '/img/promociones/paleta-de-sombras.webp', alt: 'Paleta de Sombras Nude', esPrincipal: true },
    ],
    ingredientes: [
      { nombre: 'Talco de sílice', descripcion: 'Suaviza y difumina el acabado' },
      { nombre: 'Óxido de hierro', descripcion: 'Pigmentos minerales de alta duración' },
      { nombre: 'Vitamina E', descripcion: 'Protege la zona de los párpados' },
    ],
    uso: 'Aplicar con brosel sobre el párpado. Combinar tonos para crear profundidad.',
    enPromocion: true,
    destacado: true,
  },
  {
    nombre: 'Labial Mate Larga Duración',
    descripcion: 'Labial mate de alta fijación hasta 12 horas. No transfiere.',
    descripcionCorta: 'Labial mate de fijación hasta 12 horas',
    precio: 29000,
    precioAnterior: 38000,
    stock: 25,
    categoria: 'labios',
    marca: 'lbel',
    imagenes: [
      { url: '/img/promociones/labial-mate.webp', alt: 'Labial Mate Larga Duración', esPrincipal: true, posicion: 'center 65%' },
    ],
    ingredientes: [
      { nombre: 'Cera de carnauba', descripcion: 'Sella la humedad y fija el color' },
      { nombre: 'Vitamina E', descripcion: 'Hidrata los labios' },
      { nombre: 'Pigmentos de alta cobertura', descripcion: 'Color intenso en una sola pasada' },
    ],
    uso: 'Aplicar sobre labios hidratados. Dejar secar antes de beber o comer.',
    enPromocion: true,
    destacado: true,
  },
];

async function seed() {
  try {
    if (NODE_ENV === 'production') throw new Error('El seed está deshabilitado en producción');
    const adminPassword = process.env.SEED_ADMIN_PASSWORD;
    const userPassword = process.env.SEED_USER_PASSWORD;
    if (!adminPassword || adminPassword.length < 12 || !userPassword || userPassword.length < 12) {
      throw new Error('SEED_ADMIN_PASSWORD y SEED_USER_PASSWORD deben tener al menos 12 caracteres');
    }
    const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@byjers.com';
    const userEmail = process.env.SEED_USER_EMAIL || 'cliente@test.com';
    await connectDB();

    console.log('🗑️  Limpiando base de datos...');
    await Promise.all([
      User.deleteMany({}),
      Category.deleteMany({}),
      Brand.deleteMany({}),
      Product.deleteMany({}),
    ]);

    console.log('📂 Creando categorías...');
    const categories = await Category.insertMany(categoriesData);
    const categoryMap = {};
    categories.forEach(c => categoryMap[c.slug] = c._id);

    console.log('🏷️  Creando marcas...');
    const brands = await Brand.insertMany(brandsData);
    const brandMap = {};
    brands.forEach(b => brandMap[b.slug] = b._id);

    console.log('📦 Creando productos...');
    const generateSlug = (nombre) => nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    // El SKU se fija aquí en vez de dejar que lo arme el hook pre('validate') del
    // modelo. Ese hook usa `Date.now().toString(36)` y `insertMany` valida todos
    // los documentos en el mismo milisegundo, así que los productos que comparten
    // las tres primeras letras del nombre (los tres "Shampoo ..." dan "SHA")
    // salían con SKU idéntico y el índice único de `sku` rechazaba el lote entero
    // con E11000. El índice de posición mantiene la unicidad dentro del seed.
    const productsToCreate = [...productsData, ...promoProductsData].map((p, i) => ({
      ...p,
      slug: generateSlug(p.nombre),
      sku: `BJ-${generateSlug(p.nombre).slice(0, 3).toUpperCase()}-${String(i + 1).padStart(3, '0')}`,
      categoria: categoryMap[p.categoria],
      marca: brandMap[p.marca],
    }));
    await Product.insertMany(productsToCreate);

    console.log('👤 Creando usuario admin de prueba...');
    await User.create({
      nombre: 'Admin',
      apellido: 'By Jers',
      email: adminEmail,
      password: adminPassword,
      telefono: '3001234567',
      role: 'admin',
      aceptoTerminos: true,
      aceptoPrivacidad: true,
      fechaAceptacionTerminos: new Date(),
      fechaAceptacionPrivacidad: new Date(),
    });

    console.log('👤 Creando usuario cliente de prueba...');
    await User.create({
      nombre: 'María',
      apellido: 'González',
      email: userEmail,
      password: userPassword,
      telefono: '3007654321',
      role: 'user',
      aceptoTerminos: true,
      aceptoPrivacidad: true,
      fechaAceptacionTerminos: new Date(),
      fechaAceptacionPrivacidad: new Date(),
      direcciones: [{
        alias: 'Casa',
        nombreCompleto: 'María González',
        telefono: '3007654321',
        direccion: 'Calle 123 #45-67',
        ciudad: 'Bogotá',
        departamento: 'Cundinamarca',
        codigoPostal: '110111',
        esPrincipal: true,
      }],
    });

    console.log(`
✅ Seed completado exitosamente

📊 Resumen:
  - Categorías: ${categories.length}
  - Marcas: ${brands.length}
  - Productos: ${productsToCreate.length}
  - Usuarios: 2 (admin + cliente)

    `);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error en seed:', error.message);
    if (error.writeErrors) {
      for (const we of error.writeErrors) {
        console.error(`   · ${we.path?.join('.') ?? 'desconocido'}: ${we.err?.errmsg ?? we.err?.message}`);
      }
    }
    process.exit(1);
  }
}

seed();