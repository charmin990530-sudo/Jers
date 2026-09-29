/**
 * index.js - Página de Inicio (Home) conectada a la API
 *
 * FLUJO
 * 1. Inicia los componentes compartidos (menú, carrito, chatbot).
 * 2. Carga destacados (`GET /api/products/featured`) y ofertas
 *    (`GET /api/products/promociones`) con estados de carga, vacío y error.
 * 3. Cada sección se pinta por separado: si falla una, la otra sigue funcionando.
 *
 * CAMBIO IMPORTANTE
 * -----------------
 * Antes, si la API devolvía una lista vacía o fallaba, se pintaba un catálogo de
 * DEMOSTRACIÓN con precios y stock inventados y sin ningún aviso. El cliente veía
 * productos reales con precios que no eran los reales, y no podía comprarlos
 * porque no tenían `_id`. Ahora (ver js/estados.js) una sección sin datos de la
 * API muestra un estado vacío o un error con botón de reintentar, nunca datos
 * inventados. El catálogo demo solo aparece si alguien activa el modo demo a
 * mano, y sus tarjetas llevan una insignia "Demo".
 */

import { getFeaturedProducts, getPromoProducts, getProducts, getBrands, handleApiError } from './apiClient.js';
import { renderizarPromociones, crearImagenProducto, obtenerImagenProducto, iniciarAplicacion, enlaceDetalle } from './app.js';
import { escapeHTML, safeAssetUrl, safePosition } from './sanitize.js';
import { formatearPrecio } from './config.js';
import { renderCargando, resolverCatalogo, demoActivado } from './estados.js';
import { rotarPromos } from './promos-rotativas.js';
import { inicializarMedios } from './media.js';
import { inicializarLoader } from './loader.js';

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
  inicializarLoader();
  iniciarAplicacion();
  rotarPromos();
  inicializarMedios();

  // Se lanzan en paralelo: cada sección resuelve su propio estado.
  await Promise.all([cargarDestacados(), cargarPromociones(), cargarEstadisticas(), cargarBannerPromo()]);

  document.querySelector('.herobtn')?.addEventListener('click', () => {
    document.getElementById('categorias')?.scrollIntoView({ behavior: 'smooth' });
  });
});

/** Carga cifras reales del hero: total de productos y marcas. */
async function cargarEstadisticas() {
  const contadorProductos = document.querySelector('.hero-estadisticas h3');
  const contadorMarcas = document.querySelectorAll('.hero-estadisticas h3')[1];

  try {
    const [productosRes, marcasRes] = await Promise.all([
      getProducts({ limit: 1 }),
      getBrands(),
    ]);

    if (productosRes.ok && productosRes.data?.total) {
      contadorProductos.textContent = `+${productosRes.data.total}`;
    }
    if (marcasRes.ok && Array.isArray(marcasRes.data)) {
      contadorMarcas.textContent = `+${marcasRes.data.length}`;
    }
  } catch {
    // Si falla, se mantienen los valores por defecto
  }
}

/** Muestra el banner promocional solo si hay productos en promoción. */
async function cargarBannerPromo() {
  const banner = document.querySelector('.promo-seccion');
  if (!banner) return;

  try {
    const res = await getPromoProducts();
    if (!res.ok || !res.data?.products?.length) {
      banner.style.display = 'none';
    }
  } catch {
    banner.style.display = 'none';
  }
}

/** Carga y renderiza productos destacados. */
async function cargarDestacados() {
  const contenedor = document.getElementById('destacadosGrid');
  if (!contenedor) return;

  renderCargando(contenedor, 'Cargando novedades...');

  let intentos = 0;
  const intentar = async () => {
    intentos += 1;
    const respuesta = await getFeaturedProducts();

    const productos = resolverCatalogo(contenedor, respuesta, {
      claves: ['products'],
      alReintentar: intentar,
      intento: intentos,
      vacio: 'Todavía no hay novedades publicadas.',
      alRecibir: lista => {
        const unicos = deduplicarProductos(lista);
        productosMostrados = new Set(unicos.map(claveProducto));
        renderizarDestacados(unicos, contenedor);
        return unicos;
      },
    });

    if (!respuesta.ok) {
      // Se registra para diagnóstico, pero el usuario ya ve el mensaje en pantalla.
      handleApiError({ message: respuesta.msg, status: respuesta.data?.status }, 'index-destacados');
    }
    return productos;
  };

  await intentar();
}

/** Carga y renderiza productos en promoción. */
async function cargarPromociones() {
  const contenedor = document.getElementById('promoGrid');
  if (!contenedor) return;

  renderCargando(contenedor, 'Cargando ofertas...');

  let intentos = 0;
  const intentar = async () => {
    intentos += 1;
    const respuesta = await getPromoProducts();

    const productos = resolverCatalogo(contenedor, respuesta, {
      claves: ['products'],
      alReintentar: intentar,
      intento: intentos,
      vacio: 'Ahora mismo no hay ofertas activas.',
      alRecibir: lista => {
        // No repetimos un destacado en la fila de ofertas.
        const unicos = deduplicarProductos(lista)
          .filter(producto => !productosMostrados.has(claveProducto(producto)));
        renderizarPromociones(unicos, contenedor);
        return unicos;
      },
    });

    if (!respuesta.ok) {
      handleApiError({ message: respuesta.msg, status: respuesta.data?.status }, 'index-promociones');
    }
    return productos;
  };

  await intentar();
}

/**
 * Tarjetas de novedades.
 * @param {Array} productos
 * @param {HTMLElement} contenedor
 */
function renderizarDestacados(productos, contenedor) {
  if (!productos?.length) {
    contenedor.innerHTML = '<p class="catalogo-vacio">No hay productos destacados por el momento.</p>';
    return;
  }

  const conDemo = demoActivado();

  contenedor.innerHTML = productos.map(producto => {
    const imagenPrincipal = safeAssetUrl(obtenerImagenProducto(producto));
    const posicion = safePosition(producto.imagenes?.[0]?.posicion);
    const tieneDescuento = producto.precioAnterior && producto.precioAnterior > producto.precio;
    const descuento = Number(producto.descuentoPorcentaje) || (tieneDescuento
      ? Math.round(((producto.precioAnterior - producto.precio) / producto.precioAnterior) * 100)
      : 0);
    const id = producto._id || producto.id || '';
    const nombre = escapeHTML(producto.nombre || 'Producto');
    // Sin `_id` real el producto no se puede comprar; se marca y se desactiva el
    // botón en vez de dejar un botón que falla al pulsarlo.
    const comprable = Boolean(id);
    const insigniaDemo = conDemo ? '<span class="demo-badge">Demo</span>' : '';

    return `
      <article class="card" ${id ? `data-id="${escapeHTML(id)}"` : ''} data-nombre="${nombre}" data-precio="${Number(producto.precio) || 0}">
        ${insigniaDemo}
        ${imagenPrincipal ? `<img class="cardimage" src="${escapeHTML(imagenPrincipal)}" alt="${nombre}" loading="lazy" decoding="async" style="object-position: ${escapeHTML(posicion)};">` : crearImagenProducto({ nombre: producto.nombre })}
        ${tieneDescuento ? `<span class="descuento-badge">${descuento}% OFF</span>` : ''}
        <h3 class="cardname">${nombre}</h3>
        <p class="cardprecio">
          ${tieneDescuento ? `<span class="precio-anterior">${escapeHTML(formatearPrecio(producto.precioAnterior))}</span>` : ''}
          ${escapeHTML(formatearPrecio(producto.precio))}
        </p>
        <div class="card-acciones">
          ${enlaceDetalle(producto)}
          ${comprable
            ? '<button class="cardbtn" type="button">Añadir al carrito</button>'
            : '<button class="cardbtn" type="button" disabled title="Producto de demostración: no se puede comprar">No disponible</button>'}
        </div>
      </article>
    `;
  }).join('');
}
