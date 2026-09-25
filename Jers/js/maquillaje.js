/**
 * maquillaje.js - Catálogo de Maquillaje conectado a API
 * 
 * FLUJO:
 * 1. Carga categorías de maquillaje (rostro, ojos, labios) desde /api/products/categorias
 * 2. Al hacer click en pestaña, carga productos por categoría desde /api/products/categoria/:slug
 * 3. Renderiza usando renderizarCatalogo de app.js (reutiliza lógica de UI)
 * 4. Maneja loading, errores y estado vacío
 */

import { getProductsByCategory, handleApiError } from './apiClient.js';
import { FALLBACK_CATALOG } from './fallbackCatalog.js';
import { renderizarCatalogo, crearImagenProducto, obtenerImagenProducto, iniciarAplicacion } from './app.js';

// Mapeo de slugs de categoría a nombres legibles para la UI
const CATEGORIAS_MAQUILLAJE = {
  rostro: 'Rostro',
  ojos: 'Ojos',
  labios: 'Labios',
};

// Estado de la página
let categoriaActual = 'rostro';
let catalogoCache = {}; // Cache simple para no recargar al cambiar pestaña

document.addEventListener('DOMContentLoaded', async () => {
  // Inicializa componentes compartidos (menú, carrito, chatbot, etc.)
  iniciarAplicacion();

  // Inicializa pestañas y carga categoría inicial
  await inicializarPestanas();
});

/**
 * Inicializa las pestañas del catálogo de maquillaje
 * Conecta botones .tab-btn con carga de datos desde API
 */
async function inicializarPestanas() {
  const tabsContainer = document.querySelector('.tabs[data-grupo="maquillaje"]');
  const contenedor = document.getElementById('catalogoMaquillaje');

  if (!tabsContainer || !contenedor) {
    console.warn('[maquillaje] No se encontraron elementos .tabs o #catalogoMaquillaje');
    return;
  }

  const botones = [...tabsContainer.querySelectorAll('.tab-btn')];

  // Función para mostrar una categoría
  const mostrarCategoria = async (slug) => {
    // Actualiza UI de pestañas
    botones.forEach(boton => {
      boton.classList.toggle('tab-activo', boton.dataset.categoria === slug);
    });

    // Actualiza hash URL sin recargar (para deep linking)
    window.history.replaceState(null, '', `#${slug}`);

    // Muestra loading
    contenedor.innerHTML = `
      <div class="catalogo-loading" aria-live="polite">
        <div class="spinner"></div>
        <p>Cargando ${CATEGORIAS_MAQUILLAJE[slug] || slug}...</p>
      </div>
    `;

    // Usa cache si ya cargamos esta categoría
    if (catalogoCache[slug]) {
      renderizarCatalogoDesdeAPI(catalogoCache[slug], contenedor);
      return;
    }

    // Petición a API: GET /api/products/categoria/:slug
    const response = await getProductsByCategory(slug, { limit: 50 });
    
    if (!response.ok) {
      handleApiError({ message: response.msg, status: response.data?.status }, 'maquillaje');
      catalogoCache[slug] = FALLBACK_CATALOG[slug] || [];
      renderizarCatalogoDesdeAPI(catalogoCache[slug], contenedor);
      return;
    }

    const products = response.data.products?.length ? response.data.products : (FALLBACK_CATALOG[slug] || []);
    catalogoCache[slug] = products;

    renderizarCatalogoDesdeAPI(products, contenedor);
  };

  // Event listeners para botones de pestañas
  botones.forEach(boton => {
    boton.addEventListener('click', () => {
      mostrarCategoria(boton.dataset.categoria);
    });
  });

  // Categoría inicial: desde hash URL o primera pestaña
  const hashCategoria = window.location.hash.slice(1);
  const categoriaInicial = CATEGORIAS_MAQUILLAJE[hashCategoria] ? hashCategoria : botones[0]?.dataset.categoria || 'rostro';
  
  await mostrarCategoria(categoriaInicial);
}

/**
 * Adapta productos de la API al formato que espera renderizarCatalogo
 * API devuelve: { _id, nombre, precio, precioAnterior, imagenes[], categoria, marca, ... }
 * renderizarCatalogo espera: grupos de marca con { marca, productos: [{ id, nombre, precio, imagen, posicion }] }
 * 
 * @param {Array} products - Array de productos desde API
 * @param {HTMLElement} contenedor - Elemento contenedor
 */
function renderizarCatalogoDesdeAPI(products, contenedor) {
  if (!products?.length) {
    contenedor.innerHTML = `
      <p class="catalogo-vacio">
        Aún no hay productos en esta categoría.
      </p>
    `;
    return;
  }

  // Agrupa productos por marca (nombre de marca)
  const gruposPorMarca = Object.create(null);
  
  products.forEach(producto => {
    const marcaNombre = producto.marca?.nombre || 'Sin marca';
    
    if (!gruposPorMarca[marcaNombre]) {
      gruposPorMarca[marcaNombre] = {
        marca: marcaNombre,
        productos: []
      };
    }

    // Extrae imagen principal (virtual imagenPrincipal del modelo)
    const imagenPrincipal = obtenerImagenProducto(producto);
    
    const posicion = producto.imagenes?.[0]?.posicion || 'center';

    gruposPorMarca[marcaNombre].productos.push({
      id: producto._id || producto.sku,
      nombre: producto.nombre,
      precio: producto.precio,
      precioAnterior: producto.precioAnterior,
      imagen: imagenPrincipal,
      posicion,
      // Datos extra para posible uso futuro (detalle, carrito)
      _raw: producto
    });
  });

  // Convierte objeto a array y ordena alfabéticamente por marca
  const gruposArray = Object.values(gruposPorMarca).sort((a, b) => 
    a.marca.localeCompare(b.marca)
  );

  // Usa la función compartida de app.js para renderizar
  renderizarCatalogo(gruposArray, contenedor);
}