/**
 * index.js - Página de Inicio (Home) conectada a API
 * 
 * FLUJO:
 * 1. Carga productos destacados (featured) desde /api/products/featured
 * 2. Carga productos en promoción desde /api/products/promociones
 * 3. Renderiza usando funciones de app.js
 * 4. Maneja loading, errores y estado vacío
 */

import { getFeaturedProducts, getPromoProducts, handleApiError } from './apiClient.js';
import { FALLBACK_FEATURED, FALLBACK_PROMOS } from './fallbackCatalog.js';
import { renderizarPromociones, crearImagenProducto, obtenerImagenProducto, iniciarAplicacion, enlaceDetalle } from './app.js';
import { escapeHTML, safeAssetUrl, safePosition } from './sanitize.js';

let productosMostrados = new Set();

function claveProducto(producto) {
  return String(producto?._id || producto?.slug || producto?.nombre || '')
    .trim()
    .toLowerCase();
}

function deduplicarProductos(productos) {
  const claves = new Set();
  return (productos || []).filter(producto => {
    const clave = claveProducto(producto);
    if (!clave || claves.has(clave)) return false;
    claves.add(clave);
    return true;
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  // Inicializa componentes compartidos (menú, carrito, chatbot, etc.)
  iniciarAplicacion();

  await cargarDestacados();
  await cargarPromociones();

  // El botón principal lleva a la sección de categorías sin recargar la página.
  document.querySelector('.herobtn')?.addEventListener('click', () => {
    document.getElementById('categorias')?.scrollIntoView({ behavior: 'smooth' });
  });
});

/**
 * Carga y renderiza productos destacados (sección "Novedades/Destacados")
 * GET /api/products/featured
 */
async function cargarDestacados() {
  const contenedor = document.getElementById('destacadosGrid');
  if (!contenedor) return;

  contenedor.innerHTML = `
    <div class="catalogo-loading" aria-live="polite">
      <div class="spinner"></div>
      <p>Cargando destacados...</p>
    </div>
  `;

  const response = await getFeaturedProducts();
  const products = response.ok && response.data.products?.length
    ? response.data.products
    : FALLBACK_FEATURED;
  const productsUnicos = deduplicarProductos(products);
  productosMostrados = new Set(productsUnicos.map(claveProducto));

  if (!response.ok) {
    handleApiError({ message: response.msg, status: response.data?.status }, 'index-destacados');
  }

  renderizarDestacados(productsUnicos, contenedor);
}

/**
 * Carga y renderiza productos en promoción (sección "Ofertas")
 * GET /api/products/promociones
 */
async function cargarPromociones() {
  const contenedor = document.getElementById('promoGrid');
  if (!contenedor) return;

  contenedor.innerHTML = `
    <div class="catalogo-loading" aria-live="polite">
      <div class="spinner"></div>
      <p>Cargando ofertas...</p>
    </div>
  `;

  const response = await getPromoProducts();
  const products = response.ok && response.data.products?.length
    ? response.data.products
    : FALLBACK_PROMOS;
  const productsUnicos = deduplicarProductos(products)
    .filter(producto => !productosMostrados.has(claveProducto(producto)));

  if (!response.ok) {
    handleApiError({ message: response.msg, status: response.data?.status }, 'index-promociones');
  }

  renderizarPromociones(productsUnicos, contenedor);
}

/**
 * Renderiza productos destacados (cards simples sin badge de oferta)
 * Reutiliza crearImagenProducto de app.js
 * 
 * @param {Array} products - Productos desde API
 * @param {HTMLElement} contenedor
 */
function renderizarDestacados(products, contenedor) {
  if (!products?.length) {
    contenedor.innerHTML = `
      <p class="catalogo-vacio">No hay productos destacados por el momento.</p>
    `;
    return;
  }

  contenedor.innerHTML = products.map(producto => {
    const imagenPrincipal = safeAssetUrl(obtenerImagenProducto(producto));
    const posicion = safePosition(producto.imagenes?.[0]?.posicion);
    const tieneDescuento = producto.precioAnterior && producto.precioAnterior > producto.precio;
    const descuento = Number(producto.descuentoPorcentaje) || (tieneDescuento
      ? Math.round(((producto.precioAnterior - producto.precio) / producto.precioAnterior) * 100)
      : 0);
    const id = producto._id || producto.id || '';
    const nombre = escapeHTML(producto.nombre || 'Producto');

    return `
      <article class="card" ${id ? `data-id="${escapeHTML(id)}"` : ''} data-nombre="${nombre}" data-precio="${Number(producto.precio) || 0}">
        ${imagenPrincipal ? `<img class="cardimage" src="${escapeHTML(imagenPrincipal)}" alt="${nombre}" loading="lazy" decoding="async" style="object-position: ${escapeHTML(posicion)};">` : crearImagenProducto({ nombre: producto.nombre })}
        ${tieneDescuento ? `<span class="descuento-badge">${descuento}% OFF</span>` : ''}
        <h3 class="cardname">${nombre}</h3>
        <p class="cardprecio">
          ${tieneDescuento ? `<span class="precio-anterior">$${escapeHTML(producto.precioAnterior.toLocaleString('es-CO'))}</span>` : ''}
          $${escapeHTML(producto.precio.toLocaleString('es-CO'))}
        </p>
        <div class="card-acciones">
          ${enlaceDetalle(producto)}
          <button class="cardbtn" type="button">Añadir al carrito</button>
        </div>
      </article>
    `;
  }).join('');
}