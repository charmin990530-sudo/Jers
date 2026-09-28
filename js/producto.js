/**
 * producto.js - Página de Detalle de Producto
 * 
 * FLUJO:
 * 1. Obtiene ID desde URL (?id=xxx)
 * 2. GET /api/products/:id para cargar producto
 * 3. Renderiza galería, info, ingredientes, uso
 * 4. Botón "Añadir al carrito" usa carrito híbrido (app.js)
 * 5. Carga productos relacionados por misma categoría
 */

import { getProduct, getProducts, handleApiError } from './apiClient.js';
import { crearImagenProducto, iniciarAplicacion, obtenerImagenProducto, enlaceDetalle } from './app.js';
import { escapeHTML, safeAssetUrl, safePosition } from './sanitize.js';
import { renderCargando, renderError, renderVacio, resolverCatalogo, demoActivado } from './estados.js';

document.addEventListener('DOMContentLoaded', async () => {
    // Inicializa componentes compartidos
    iniciarAplicacion();

    // Acepta ?id= (con backend) o ?slug= (catálogo local, sin backend)
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('id');
    const productSlug = urlParams.get('slug');

    if (!productId && !productSlug) {
        mostrarError('Producto no especificado');
        return;
    }

    await cargarProducto(productId, productSlug);
});

/**
 * Carga y renderiza el producto
 * @param {string|null} productId
 * @param {string|null} productSlug
 */
async function cargarProducto(productId, productSlug) {
    const contenedor = document.getElementById('productoContenido');
    
    renderCargando(contenedor, 'Cargando producto...');

    // Sin id ni slug no hay nada que pedir.
    if (!productId && !productSlug) {
        renderError(contenedor, 'El enlace del producto esta incompleto.', () => {
            window.location.href = '/';
        });
        return;
    }

    // ANTES: con ?slug= se resolvia contra el catalogo local hardcodeado, asi que
    // la ficha de un producto se podia pintar con un precio que no era el de la
    // base de datos. Ahora el detalle sale SIEMPRE de la API. El catalogo demo
    // solo se usa si alguien lo activa a mano (localStorage.byJersDemo = '1').
    if (productSlug && !productId && demoActivado()) {
        const { buscarFallbackPorSlug } = await import('./fallbackCatalog.js');
        const local = buscarFallbackPorSlug(productSlug);
        if (local) {
            mostrarProducto({ ...local, esDemo: true });
            return;
        }
    }

    const cargar = async () => {
        renderCargando(contenedor, 'Cargando producto...');
        // El backend expone el detalle por id. Con slug se pide el listado de la
        // categoria y se filtra, porque /api/products/:id espera un ObjectId.
        const response = productId
            ? await getProduct(productId)
            : await buscarPorSlug(productSlug);

        if (!response.ok) {
            handleApiError({ message: response.msg, status: response.data?.status }, 'producto');
            renderError(contenedor, response.msg || 'No se pudo cargar el producto.', cargar);
            return;
        }
        const producto = response.data?.product;
        if (!producto) {
            renderVacio(contenedor, 'Ese producto ya no esta disponible.');
            return;
        }
        mostrarProducto(producto);
    };

    await cargar();
}

/**
 * Busca un producto por su slug usando los endpoints que ya existen.
 *
 * `GET /api/products/:id` espera un ObjectId, asi que para resolver por slug se
 * pide el catalogo completo (16 productos, pagina de 50) y se filtra en el
 * cliente. No es una consulta por producto, pero evita depender del catalogo
 * hardcodeado: el precio que se muestra es el de la base de datos.
 *
 * @param {string} slug
 * @returns {Promise<{ok: boolean, data?: any, msg?: string}>}
 */
async function buscarPorSlug(slug) {
    if (!slug) return { ok: false, msg: 'Falta el identificador del producto.' };
    const respuesta = await getProducts({ limit: 50 });
    if (!respuesta.ok) return respuesta;
    const lista = Array.isArray(respuesta.data?.products) ? respuesta.data.products : [];
    const producto = lista.find(p => p.slug === slug);
    if (!producto) return { ok: false, msg: 'Ese producto ya no esta disponible.' };
    return { ok: true, data: { product: producto } };
}

/**
 * Actualiza la página con el producto ya resuelto
 * @param {Object} producto
 */
function mostrarProducto(producto) {
    const contenedor = document.getElementById('productoContenido');
    if (!contenedor) return;

    // Actualiza título de página
    document.title = `By Jers | ${producto.nombre}`;

    // Actualiza breadcrumb
    actualizarBreadcrumb(producto);

    // Renderiza producto
    renderizarProducto(producto, contenedor);

    // Carga productos relacionados (misma categoría, excluyendo actual)
    cargarRelacionados(producto.categoria?._id || producto.categoria, producto._id || producto.slug);
}

/**
 * Actualiza breadcrumb con categoría y nombre del producto
 * @param {Object} producto
 */
function actualizarBreadcrumb(producto) {
    const catLink = document.getElementById('breadcrumbCategoria');
    const prodSpan = document.getElementById('breadcrumbProducto');
    
    if (catLink && producto.categoria) {
        const esCabello = /shampoo|acondicionador|tratamiento|cabello/i.test(`${producto.categoria.slug} ${producto.categoria.nombre}`);
        catLink.href = `${esCabello ? 'cabello' : 'maquillaje'}.html#${producto.categoria.slug}`;
        catLink.textContent = producto.categoria.nombre;
    }
    if (prodSpan) {
        prodSpan.textContent = producto.nombre;
    }
}

/**
 * Renderiza el detalle completo del producto
 * @param {Object} producto - Datos desde API
 * @param {HTMLElement} contenedor
 */
function renderizarProducto(producto, contenedor) {
    const imagenes = (producto.imagenes || [])
        .map(image => ({ ...image, url: safeAssetUrl(image.url), posicion: safePosition(image.posicion) }))
        .filter(image => image.url);
    const principal = imagenes.find(image => image.esPrincipal) || imagenes[0];
    const imagenPrincipal = safeAssetUrl(principal?.url || producto.imagenPrincipal || obtenerImagenProducto(producto)) || '/img/placeholder.svg';
    const tieneDescuento = producto.precioAnterior && producto.precioAnterior > producto.precio;
    const descuentoPct = producto.descuentoPorcentaje || (tieneDescuento ? Math.round(((producto.precioAnterior - producto.precio) / producto.precioAnterior) * 100) : 0);
    // El catálogo local no guarda stock. Sin ese dato no se puede afirmar que el
    // producto esté agotado, así que solo se marca sin stock cuando el valor viene.
    const stockConocido = producto.stock !== undefined && producto.stock !== null;
    const stock = stockConocido ? Number(producto.stock) || 0 : null;
    const enStock = stockConocido ? stock > 0 : true;

    // Genera thumbnails de galería
    const thumbnails = imagenes.length > 1 
        ? imagenes.map((img, idx) => `
            <button class="galeria-thumb ${idx === 0 ? 'activo' : ''}" 
                    data-img="${escapeHTML(img.url)}" 
                    data-pos="${escapeHTML(img.posicion || 'center')}"
                    aria-label="Ver imagen ${idx + 1}"
                    type="button">
                <img src="${escapeHTML(img.url)}" alt="${escapeHTML(producto.nombre)} - Vista ${idx + 1}">
            </button>
        `).join('')
        : '';

    contenedor.innerHTML = `
        <div class="producto-galeria">
            <div class="galeria-principal">
                <img id="imagenPrincipal" 
                     src="${escapeHTML(imagenPrincipal)}" 
                     alt="${escapeHTML(producto.nombre)}" 
                     style="object-position: ${escapeHTML(principal?.posicion || 'center')};"
                     loading="eager">
            </div>
            ${thumbnails ? `
                <div class="galeria-thumbs" role="group" aria-label="Galería de imágenes">
                    ${thumbnails}
                </div>
            ` : ''}
        </div>

        <div class="producto-info">
            ${producto.categoria?.nombre ? `<span class="producto-categoria">${escapeHTML(producto.categoria.nombre)}</span>` : ''}
            ${producto.marca?.nombre ? `<span class="producto-marca">${escapeHTML(producto.marca.nombre)}</span>` : ''}

            <h1 class="producto-nombre">${escapeHTML(producto.nombre || 'Producto')}</h1>

            <div class="producto-precio">
                ${tieneDescuento ? `
                    <span class="precio-anterior">$${escapeHTML(producto.precioAnterior.toLocaleString('es-CO'))}</span>
                    <span class="descuento-badge">${escapeHTML(Number(descuentoPct) || 0)}% OFF</span>
                ` : ''}
                <span class="precio-actual">$${escapeHTML(producto.precio.toLocaleString('es-CO'))}</span>
            </div>

            ${stockConocido ? `
                <div class="producto-stock ${enStock ? 'en-stock' : 'sin-stock'}">
                    ${enStock ? `
                        <span class="stock-icon">✓</span>
                        <span>Disponible: ${escapeHTML(stock)} unidad${stock === 1 ? '' : 'es'}</span>
                    ` : `
                        <span class="stock-icon">✕</span>
                        <span>Agotado</span>
                    `}
                </div>
            ` : ''}

            ${producto.descripcionCorta ? `
                <p class="producto-descripcion-corta">${escapeHTML(producto.descripcionCorta)}</p>
            ` : ''}

            ${enStock ? `
                <div class="producto-cantidad">
                    <label for="productoCantidad">Cantidad</label>
                    <div class="producto-cantidad__control">
                        <button type="button" id="productoCantidadMenos" aria-label="Quitar una unidad">&minus;</button>
                        <input type="number" id="productoCantidad" name="cantidad"
                               value="1" min="1" max="${Math.max(1, Math.min(99, stock))}"
                               step="1" inputmode="numeric"
                               aria-describedby="productoCantidadMax">
                        <button type="button" id="productoCantidadMas" aria-label="Añadir una unidad">+</button>
                    </div>
                    <p class="producto-cantidad__ayuda" id="productoCantidadMax">
                        Máximo ${stock} ${stock === 1 ? 'unidad disponible' : 'unidades disponibles'}
                    </p>
                </div>
            ` : ''}

            <div class="producto-acciones">
                <button id="btnAgregarCarrito" 
                        class="btn-agregar-carrito" 
                        type="button"
                        data-id="${escapeHTML(producto._id || '')}"
                        data-nombre="${escapeHTML(producto.nombre || '')}"
                        data-precio="${Number(producto.precio) || 0}"
                        ${!enStock ? 'disabled' : ''}>
                    ${enStock ? '🛍️ Añadir al carrito' : '🚫 Agotado'}
                </button>
                <button id="btnComprarAhora" 
                        class="btn-comprar-ahora" 
                        type="button"
                        ${!enStock ? 'disabled' : ''}>
                    🚀 Comprar ahora
                </button>
            </div>

            ${(producto.sku || producto.categoria?.nombre || producto.marca?.nombre) ? `
                <div class="producto-meta">
                    ${producto.sku ? `
                        <div class="meta-item">
                            <span class="meta-label">SKU:</span>
                            <span class="meta-valor">${escapeHTML(producto.sku)}</span>
                        </div>
                    ` : ''}
                    ${producto.categoria?.nombre ? `
                        <div class="meta-item">
                            <span class="meta-label">Categoría:</span>
                            <span class="meta-valor">${escapeHTML(producto.categoria.nombre)}</span>
                        </div>
                    ` : ''}
                    ${producto.marca?.nombre ? `
                        <div class="meta-item">
                            <span class="meta-label">Marca:</span>
                            <span class="meta-valor">${escapeHTML(producto.marca.nombre)}</span>
                        </div>
                    ` : ''}
                </div>
            ` : ''}
        </div>
    `;

    // Inicializa galería interactiva
    inicializarGaleria(imagenes);

    // Event listeners para botones
    const btnCarrito = document.getElementById('btnAgregarCarrito');
    const btnComprar = document.getElementById('btnComprarAhora');

    // Stepper de cantidad: no habia selector, asi que "Comprar ahora" siempre
    // compraba 1 unidad aunque el usuario quisiera varias.
    const inputCantidad = document.getElementById('productoCantidad');
    const maxCantidad = Math.max(1, Math.min(99, stock));
    const ajustar = delta => {
        if (!inputCantidad) return;
        const actual = Number(inputCantidad.value) || 1;
        inputCantidad.value = String(Math.max(1, Math.min(maxCantidad, actual + delta)));
    };
    document.getElementById('productoCantidadMenos')?.addEventListener('click', () => ajustar(-1));
    document.getElementById('productoCantidadMas')?.addEventListener('click', () => ajustar(1));

    // `cantidad` sale del selector. Con 1 (o sin selector) equivale a "añadir uno".
    const cantidadElegida = () => {
        const input = document.getElementById('productoCantidad');
        const n = Number(input?.value) || 1;
        return Math.max(1, Math.min(99, n));
    };

    if (btnCarrito) {
        btnCarrito.addEventListener('click', () => {
            document.dispatchEvent(new CustomEvent('carrito-agregar', {
                detail: {
                    id: producto._id,
                    nombre: producto.nombre,
                    precio: producto.precio,
                    imagen: producto.imagenes?.[0]?.url || '',
                    cantidad: cantidadElegida(),
                },
            }));
        });
    }

    if (btnComprar) {
        btnComprar.addEventListener('click', () => {
            // C2: antes onComplete se llamaba SIEMPRE, incluso si agregarProducto
            // fallaba (sin _id, error de API, sin stock). El usuario llegaba al
            // checkout con el carrito vacío y un mensaje de "carrito vacío" sin
            // explicación. Ahora solo se navega si el producto entró de verdad, y
            // la cantidad y el precio viajan con el evento.
            btnComprar.disabled = true;
            document.dispatchEvent(new CustomEvent('carrito-agregar', {
                detail: {
                    id: producto._id,
                    nombre: producto.nombre,
                    precio: producto.precio,
                    imagen: producto.imagenes?.[0]?.url || '',
                    cantidad: cantidadElegida(),
                    onComplete: ok => {
                        btnComprar.disabled = false;
                        if (!ok) return;
                        // Ruta sin extensión: el servidor la resuelve a
                        // /checkout.html (mismo origen, mismo puerto).
                        window.location.href = '/checkout';
                    },
                },
            }));
        });
    }

    // Renderiza secciones adicionales: descripción, ingredientes, uso
    renderizarDetalles(producto);
}

/**
 * Inicializa galería de imágenes con thumbnails
 * @param {Array} imagenes
 */
function inicializarGaleria(imagenes) {
    const imgPrincipal = document.getElementById('imagenPrincipal');
    const thumbs = document.querySelectorAll('.galeria-thumb');

    thumbs.forEach(thumb => {
        thumb.addEventListener('click', () => {
            const nuevaImg = thumb.dataset.img;
            const nuevaPos = thumb.dataset.pos || 'center';
            
            if (imgPrincipal && nuevaImg !== imgPrincipal.src) {
                imgPrincipal.style.opacity = '0';
                setTimeout(() => {
                    imgPrincipal.src = nuevaImg;
                    imgPrincipal.style.objectPosition = nuevaPos;
                    imgPrincipal.style.opacity = '1';
                }, 150);
            }

            thumbs.forEach(t => t.classList.remove('activo'));
            thumb.classList.add('activo');
        });

        // Keyboard support
        thumb.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                thumb.click();
            }
        });
    });
}

/**
 * Renderiza secciones de descripción, ingredientes y uso
 * @param {Object} producto
 */
function renderizarDetalles(producto) {
    const contenedor = document.getElementById('productoContenido');
    if (!contenedor) return;

    const tieneIngredientes = producto.ingredientes && producto.ingredientes.length > 0;
    const tieneUso = producto.uso && producto.uso.trim().length > 0;
    const tieneDescripcion = producto.descripcion && producto.descripcion.trim().length > 0;

    if (!tieneDescripcion && !tieneIngredientes && !tieneUso) return;

    const detallesHTML = `
        <div class="producto-detalles-tabs">
            <div class="tabs-tabs" role="tablist">
                ${tieneDescripcion ? `
                    <button class="tab-tab activo" role="tab" aria-selected="true" data-tab="descripcion">
                        Descripción
                    </button>
                ` : ''}
                ${tieneIngredientes ? `
                    <button class="tab-tab" role="tab" aria-selected="false" data-tab="ingredientes">
                        Ingredientes
                    </button>
                ` : ''}
                ${tieneUso ? `
                    <button class="tab-tab" role="tab" aria-selected="false" data-tab="uso">
                        Modo de uso
                    </button>
                ` : ''}
            </div>

            <div class="tab-panels">
                ${tieneDescripcion ? `
                    <div class="tab-panel activo" role="tabpanel" id="tab-descripcion">
                        <p>${escapeHTML(producto.descripcion)}</p>
                    </div>
                ` : ''}
                ${tieneIngredientes ? `
                    <div class="tab-panel" role="tabpanel" id="tab-ingredientes" hidden>
                        <ul class="ingredientes-lista">
                            ${producto.ingredientes.map(ing => `
                                <li>
                                    <strong>${escapeHTML(ing.nombre || '')}</strong>
                                    ${ing.descripcion ? `<span>– ${escapeHTML(ing.descripcion)}</span>` : ''}
                                </li>
                            `).join('')}
                        </ul>
                    </div>
                ` : ''}
                ${tieneUso ? `
                    <div class="tab-panel" role="tabpanel" id="tab-uso" hidden>
                        <p>${escapeHTML(producto.uso)}</p>
                    </div>
                ` : ''}
            </div>
        </div>
    `;

    // Inserta después de .producto-info
    const productoInfo = contenedor.querySelector('.producto-info');
    if (productoInfo) {
        productoInfo.insertAdjacentHTML('afterend', detallesHTML);
        inicializarTabsDetalles();
    }
}

/**
 * Inicializa tabs de detalles (Descripción, Ingredientes, Uso)
 */
function inicializarTabsDetalles() {
    const tabs = document.querySelectorAll('.tab-tab');
    const panels = document.querySelectorAll('.tab-panel');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.tab;

            tabs.forEach(t => {
                t.classList.remove('activo');
                t.setAttribute('aria-selected', 'false');
            });
            tab.classList.add('activo');
            tab.setAttribute('aria-selected', 'true');

            panels.forEach(panel => {
                if (panel.id === `tab-${target}`) {
                    panel.hidden = false;
                    panel.classList.add('activo');
                } else {
                    panel.hidden = true;
                    panel.classList.remove('activo');
                }
            });
        });
    });
}

/**
 * Carga productos relacionados de la misma categoría
 * @param {string} categoriaId - ObjectId de la categoría
 * @param {string} excluirId - ID del producto actual para excluir
 */
async function cargarRelacionados(categoriaId, excluirId) {
    // El catálogo local no tiene categorías con ObjectId, así que sin backend
    // se arma la lista desde el propio catálogo para no dejar la sección vacía.
    // Sin categoria no hay forma de pedir relacionados. Antes se sustitulian por
    // productos del catalogo local (precios que no eran los reales); ahora la
    // seccion simplemente no se muestra, que es la verdad.
    if (!categoriaId) return;

    const response = await getProducts({ categoria: categoriaId, limit: 8 });
    if (!response.ok) {
        console.warn('[Producto] No se pudieron cargar relacionados:', response.msg);
        return;
    }

    const lista = Array.isArray(response.data?.products) ? response.data.products : [];
    const relacionados = lista.filter(p => p._id !== excluirId).slice(0, 4);
    if (relacionados.length === 0) return;
    pintarRelacionados(relacionados);
}

/**
 * Pinta la rejilla de productos relacionados
 * @param {Object[]} relacionados
 */
function pintarRelacionados(relacionados) {
    const seccion = document.getElementById('seccionRelacionados');
    const grid = document.getElementById('relacionadosGrid');

    if (seccion && grid) {
        seccion.hidden = false;
        grid.innerHTML = relacionados.map(p => {
            const img = safeAssetUrl(obtenerImagenProducto(p));
            const pos = safePosition(p.imagenes?.[0]?.posicion);
            const desc = p.precioAnterior && p.precioAnterior > p.precio;
            const id = escapeHTML(p._id || '');

            return `
                <article class="card" data-id="${id}" data-nombre="${escapeHTML(p.nombre || '')}" data-precio="${Number(p.precio) || 0}">
                    ${img ? `<img class="cardimage" src="${escapeHTML(img)}" alt="${escapeHTML(p.nombre || '')}" loading="lazy" decoding="async" style="object-position: ${escapeHTML(pos)};">` : crearImagenProducto({ nombre: p.nombre })}
                    ${desc ? `<span class="descuento-badge">${Number(p.descuentoPorcentaje) || 0}% OFF</span>` : ''}
                    <h3 class="cardname">${escapeHTML(p.nombre || 'Producto')}</h3>
                    <p class="cardprecio">
                        ${desc ? `<span class="precio-anterior">$${escapeHTML(p.precioAnterior.toLocaleString('es-CO'))}</span>` : ''}
                        $${escapeHTML(p.precio.toLocaleString('es-CO'))}
                    </p>
                    <div class="card-acciones">
                        ${enlaceDetalle(p)}
                        <button class="cardbtn" type="button">Añadir al carrito</button>
                    </div>
                </article>
            `;
        }).join('');
    }
}

/**
 * Muestra estado de error
 * @param {string} mensaje
 */
function mostrarError(mensaje) {
    const contenedor = document.getElementById('productoContenido');
    contenedor.innerHTML = `
        <div class="producto-error">
            <p>${mensaje}</p>
            <a href="index.html" class="btn-volver">← Volver al inicio</a>
        </div>
    `;
}