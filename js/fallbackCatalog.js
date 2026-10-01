const productos = [
    {
        nombre: 'Base Atenea',
        stock: 50,
        descripcionCorta: 'Base profesional alta cobertura con FPS 15',
        precio: 58000,
        precioAnterior: 68000,
        imagenes: [{ url: '/img/productos/base-atenea.webp', posicion: 'center 80%', esPrincipal: true }],
        marca: { nombre: 'Atenea Profesional' },
        destacado: true,
        enPromocion: true,
    },
    {
        nombre: 'Corrector Atenea',
        stock: 40,
        descripcionCorta: 'Corrector alta cobertura con vitamina E',
        precio: 38000,
        imagenes: [{ url: '/img/productos/corrector-atenea.webp', posicion: 'center 50%', esPrincipal: true }],
        marca: { nombre: 'Atenea Profesional' },
        destacado: true,
    },
    {
        nombre: "Base Matte L'Bel",
        stock: 35,
        descripcionCorta: 'Base matte larga duración control brillo',
        precio: 62000,
        imagenes: [{ url: '/img/productos/base-matte-lbel.webp', posicion: 'center 50%', esPrincipal: true }],
        marca: { nombre: "L'Bel" },
    },
    {
        nombre: 'Sombras Atenea',
        stock: 30,
        descripcionCorta: 'Paleta 9 sombras mate y shimmer',
        precio: 45000,
        precioAnterior: 55000,
        imagenes: [{ url: '/img/productos/sombras-atenea.webp', posicion: 'center 50%', esPrincipal: true }],
        marca: { nombre: 'Atenea Profesional' },
        destacado: true,
        enPromocion: true,
    },
    {
        nombre: 'Delineador en Gel JDG',
        stock: 45,
        descripcionCorta: 'Delineador gel resistente al agua',
        precio: 34000,
        imagenes: [{ url: '/img/productos/delineador-en-gel-jdg.webp', posicion: 'center 90%', esPrincipal: true }],
        marca: { nombre: 'Jorge de la Garza' },
    },
    {
        nombre: 'Lip Gloss',
        stock: 60,
        descripcionCorta: 'Gloss hidratante efecto volumen',
        precio: 32000,
        imagenes: [{ url: '/img/productos/lip-gloss.webp', posicion: '30% 75%', esPrincipal: true }],
        marca: { nombre: 'Atenea Profesional' },
        destacado: true,
    },
    {
        nombre: "Labial Mate L'Bel",
        stock: 40,
        descripcionCorta: 'Labial mate larga duración confortable',
        precio: 36000,
        precioAnterior: 42000,
        imagenes: [{ url: '/img/productos/labial-mate-lbl.webp', posicion: 'center 90%', esPrincipal: true }],
        marca: { nombre: "L'Bel" },
        enPromocion: true,
    },
    {
        nombre: 'Shampoo Hidratación Profunda',
        stock: 55,
        descripcionCorta: 'Shampoo con keratina, argán y aloe vera',
        precio: 46000,
        precioAnterior: 52000,
        imagenes: [{ url: '/img/productos/shampoo-hidratacion-profunda.webp', esPrincipal: true }],
        marca: { nombre: 'Atenea Profesional' },
        destacado: true,
        enPromocion: true,
    },
    {
        nombre: "Shampoo Anticaída L'Bel",
        stock: 30,
        descripcionCorta: 'Shampoo anticaída fortalecedor',
        precio: 52000,
        imagenes: [{ url: '/img/productos/shampoo-anti-caida.webp', esPrincipal: true }],
        marca: { nombre: "L'Bel" },
    },
    {
        nombre: 'Shampoo Nutritivo JDG',
        stock: 40,
        descripcionCorta: 'Shampoo nutritivo proteínas de seda',
        precio: 41000,
        imagenes: [{ url: '/img/productos/shampoo-nutritivo.webp', esPrincipal: true }],
        marca: { nombre: 'Jorge de la Garza' },
    },
    {
        nombre: 'Acondicionador Reparador',
        stock: 45,
        descripcionCorta: 'Acondicionador reparador sella cutículas',
        precio: 46000,
        imagenes: [{ url: '/img/productos/acondicionador-reparador.webp', esPrincipal: true }],
        marca: { nombre: 'Atenea Profesional' },
    },
    {
        nombre: "Acondicionador Nutrición Intensa L'Bel",
        stock: 35,
        descripcionCorta: 'Acondicionador nutrición intensa cabello seco',
        precio: 50000,
        imagenes: [{ url: '/img/productos/acondicionador-nutricion-intensa.webp', esPrincipal: true }],
        marca: { nombre: "L'Bel" },
    },
    {
        nombre: 'Tratamiento Control de Frizz',
        stock: 25,
        descripcionCorta: 'Tratamiento anti-frizz con keratina',
        precio: 58000,
        imagenes: [{ url: '/img/productos/tratamiento-control-de-frizz.webp', esPrincipal: true }],
        marca: { nombre: 'Atenea Profesional' },
        destacado: true,
    },
    {
        nombre: 'Ampolletas de Keratina JDG',
        stock: 30,
        descripcionCorta: 'Ampolletas keratina tratamiento intensivo',
        precio: 39000,
        imagenes: [{ url: '/img/productos/keratina-ampolleta.webp', posicion: 'center 70%', esPrincipal: true }],
        marca: { nombre: 'Jorge de la Garza' },
    },
    {
        nombre: 'Paleta de Sombras Nude',
        stock: 20,
        descripcionCorta: 'Paleta de sombras en tonos nude',
        precio: 45000,
        precioAnterior: 58000,
        imagenes: [{ url: '/img/promociones/paleta-de-sombras.webp', esPrincipal: true }],
        marca: { nombre: 'Atenea Profesional' },
        destacado: true,
        enPromocion: true,
    },
    {
        nombre: 'Labial Mate Larga Duración',
        stock: 25,
        descripcionCorta: 'Labial mate de alta fijación hasta 12 horas',
        precio: 29000,
        precioAnterior: 38000,
        imagenes: [{ url: '/img/promociones/labial-mate.webp', posicion: 'center 65%', esPrincipal: true }],
        marca: { nombre: "L'Bel" },
        destacado: true,
        enPromocion: true,
    },
];

/**
 * Genera el slug de un producto con la misma convención que usa el frontend
 * (js/app.js → normalizarNombre): minúsculas, sin acentos y separada por guiones.
 * El catálogo local no tiene _id de MongoDB, así que el detalle de producto se
 * resuelve por slug. Sin esto la tarjeta se queda sin botón "Ver detalle".
 * @param {string} nombre
 * @returns {string}
 */
export function generarSlug(nombre) {
    return String(nombre)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
}

// El catálogo local no tiene _id de MongoDB, así que el detalle de producto se
// resuelve por slug. Sin esto la tarjeta se queda sin botón "Ver detalle".
productos.forEach(producto => {
    producto.slug = generarSlug(producto.nombre);
});

/** Busca un producto del catálogo local por su slug. */
export function buscarFallbackPorSlug(slug) {
    if (!slug) return null;
    return productos.find(producto => producto.slug === slug) ?? null;
}
