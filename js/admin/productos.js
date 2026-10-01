import { api, handleApiError, apiErrorFromResponse } from '../../js/api.js';
import { protegerRuta } from '../rutas.js';
import { formatearPrecio } from '../config.js';
import {
    iniciarAplicacion,
    mostrarErrorCampo,
    limpiarErroresFormulario,
    mostrarMensajeGlobal,
    setBtnLoading
} from '../../js/app.js';
import { escapeHTML, safeAssetUrl } from '../../js/sanitize.js';

let paginaActual = 1;
let totalPaginas = 1;
// Contador de la ultima peticion de "cargar producto para editar". Cada apertura
// del modal incrementa esta secuencia y solo la que tenga el numero mas alto
// pinta el formulario (ver cargarProductoParaEditar).
let secuenciaEdicion = 0;
let categoriasCache = [];
let marcasCache = [];
let productosCache = [];

document.addEventListener('DOMContentLoaded', async () => {
    iniciarAplicacion();
    await verificarAdminYCargar();
    inicializarFiltros();
    inicializarPaginacion();
    inicializarModal();
    inicializarFormulario();
});

async function verificarAdminYCargar() {
    // Proteccion centralizada (js/rutas.js). Una sola politica para todo el
    // panel: sin sesion -> login con esta URL de vuelta; con sesion pero sin
    // rol de admin -> inicio. Antes cada script repetia el chequeo con rutas
    // relativas distintas ('../login.html' frente a '/login'), y se colgaba con
    // '../index.html' en una app que ya no tiene esa estructura.
    const { ok } = await protegerRuta({ requiereAdmin: true, pantalla: 'admin-productos' });
    if (!ok) return;
    await cargarCategorias();
    await cargarMarcas();
    await cargarProductos();
}

async function cargarCategorias() {
    const response = await api.getAdminCategories();
    if (!response.ok) {
        throw new Error(response.msg || 'No se pudieron cargar las categorías');
    }

    categoriasCache = Array.isArray(response.data?.categories) ? response.data.categories : [];
    poblarSelect('categoria', categoriasCache, 'nombre');
    poblarSelect('filtroCategoria', categoriasCache, 'nombre');
}

async function cargarMarcas() {
    const response = await api.getAdminBrands();
    if (!response.ok) {
        throw new Error(response.msg || 'No se pudieron cargar las marcas');
    }

    marcasCache = Array.isArray(response.data?.brands) ? response.data.brands : [];
    poblarSelect('marca', marcasCache, 'nombre');
    poblarSelect('filtroMarca', marcasCache, 'nombre');
}

function poblarSelect(selectId, items, labelField) {
    const select = document.getElementById(selectId);
    if (!select) return;

    const firstOption = select.querySelector('option');
    select.innerHTML = '';
    if (firstOption) select.appendChild(firstOption);

    items.forEach(item => {
        const option = document.createElement('option');
        option.value = item?._id || '';
        option.textContent = item?.[labelField] || item?.nombre || '';
        select.appendChild(option);
    });
}

async function cargarProductos(pagina = 1) {
    const tbody = document.getElementById('productosBody');
    if (!tbody) return;

    const btnAnt = document.getElementById('pagAnterior');
    const btnSig = document.getElementById('pagSiguiente');
    const pagInfo = document.getElementById('pagInfo');
    const pagination = document.getElementById('pagination');

    if (pagina === 1) {
        tbody.innerHTML = `
            <tr class="loading-row">
                <td colspan="9"><div class="spinner"></div> Cargando...</td>
            </tr>
        `;
    }

    const params = {
        page: pagina,
        limit: 10,
        search: document.getElementById('filtroBuscar')?.value.trim() || '',
        categoria: document.getElementById('filtroCategoria')?.value || '',
        marca: document.getElementById('filtroMarca')?.value || '',
        activo: document.getElementById('filtroEstado')?.value || '',
        enPromocion: document.getElementById('filtroPromocion')?.value || ''
    };

    try {
        const response = await api.getAdminProducts(params);
        if (!response.ok) {
            throw new Error(response.msg || 'No se pudieron cargar los productos');
        }

        const data = response.data || {};
        const products = Array.isArray(data.products) ? data.products : [];
        const total = Number(data.total) || 0;
        const pages = Math.max(0, Number(data.pages) || 0);

        productosCache = products;
        renderProductos(products);
        paginaActual = Math.max(1, Number(data.page) || pagina);
        totalPaginas = Math.max(1, pages);

        const resultCount = document.getElementById('resultCount');
        if (resultCount) {
            resultCount.textContent = `${total} producto${total !== 1 ? 's' : ''}`;
        }

        if (pagination) pagination.hidden = pages <= 1;
        if (pagInfo) pagInfo.textContent = `Página ${paginaActual} de ${Math.max(pages, 1)} (${total} productos)`;
        if (btnAnt) btnAnt.disabled = paginaActual <= 1;
        if (btnSig) btnSig.disabled = paginaActual >= totalPaginas;
    } catch (error) {
        handleApiError({ message: error.message }, 'cargar-productos');
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="empty-state">Error al cargar productos</td>
            </tr>
        `;
    }
}

function renderProductos(products) {
    const tbody = document.getElementById('productosBody');
    if (!tbody) return;

    if (!products.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="empty-state">No hay productos</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = products.map(producto => {
        const imagen = safeAssetUrl(producto?.imagenPrincipal || producto?.imagenes?.[0]?.url || '');
        const id = escapeHTML(producto?._id || '');
        const nombre = escapeHTML(producto?.nombre || 'Producto sin nombre');
        const descripcion = escapeHTML(producto?.descripcionCorta || '');
        const sku = escapeHTML(producto?.sku || 'N/A');
        const categoria = escapeHTML(producto?.categoria?.nombre || 'N/A');
        const marca = escapeHTML(producto?.marca?.nombre || 'N/A');
        const precioAnterior = Number(producto?.precioAnterior) || 0;
        const precio = Number(producto?.precio) || 0;
        const stock = Number(producto?.stock) || 0;
        const activo = producto?.activo !== false;
        const imagenHtml = imagen
            ? `<img src="${escapeHTML(imagen)}" alt="${nombre}" class="tabla-imagen">`
            : '<span class="sin-imagen">📷</span>';

        return `
            <tr data-id="${id}">
                <td>${imagenHtml}</td>
                <td>
                    <strong>${nombre}</strong>
                    ${descripcion ? `<br><small class="text-muted">${descripcion}</small>` : ''}
                </td>
                <td><code>${sku}</code></td>
                <td>${categoria}</td>
                <td>${marca}</td>
                <td>
                    ${precioAnterior > precio ? `<span class="precio-anterior">${escapeHTML(formatearMoneda(precioAnterior))}</span><br>` : ''}
                    <strong>${escapeHTML(formatearMoneda(precio))}</strong>
                </td>
                <td>
                    <span class="stock-badge ${stock > 10 ? 'stock-ok' : stock > 0 ? 'stock-bajo' : 'stock-agotado'}">
                        ${stock > 0 ? escapeHTML(stock) : 'Agotado'}
                    </span>
                </td>
                <td>
                    <span class="estado-badge ${activo ? 'estado-activo' : 'estado-inactivo'}">
                        ${activo ? 'Activo' : 'Inactivo'}
                    </span>
                    ${producto?.destacado ? '<span class="badge-destacado">⭐ Destacado</span>' : ''}
                    ${producto?.enPromocion ? '<span class="badge-promo">🔥 Promo</span>' : ''}
                </td>
                <td>
                    <div class="acciones-cell">
                        <button type="button" class="btn-accion btn-editar" data-id="${id}" title="Editar">Editar</button>
                        <button type="button" class="btn-accion btn-eliminar" data-id="${id}" title="Desactivar">Desactivar</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    tbody.querySelectorAll('.btn-editar').forEach(button => {
        button.addEventListener('click', () => abrirModalProducto(button.dataset.id));
    });
    tbody.querySelectorAll('.btn-eliminar').forEach(button => {
        button.addEventListener('click', () => confirmarEliminar(button.dataset.id));
    });
}

function inicializarFiltros() {
    const filtros = ['filtroBuscar', 'filtroCategoria', 'filtroMarca', 'filtroEstado', 'filtroPromocion'];
    filtros.forEach(id => {
        const element = document.getElementById(id);
        if (!element) return;

        element.addEventListener('change', () => {
            paginaActual = 1;
            cargarProductos(1);
        });
        if (element.tagName === 'INPUT') {
            element.addEventListener('input', debounce(() => {
                paginaActual = 1;
                cargarProductos(1);
            }, 500));
        }
    });
}

function inicializarPaginacion() {
    document.getElementById('pagAnterior')?.addEventListener('click', () => {
        if (paginaActual > 1) cargarProductos(paginaActual - 1);
    });
    document.getElementById('pagSiguiente')?.addEventListener('click', () => {
        if (paginaActual < totalPaginas) cargarProductos(paginaActual + 1);
    });
}

function inicializarModal() {
    const modal = document.getElementById('modalProducto');
    const btnNuevo = document.getElementById('btnNuevoProducto');
    const btnCancelar = document.getElementById('btnCancelarProducto');

    btnNuevo?.addEventListener('click', () => abrirModalProducto());
    btnCancelar?.addEventListener('click', cerrarModalProducto);

    modal?.addEventListener('click', event => {
        if (event.target === modal || event.target.matches('.modal-cerrar')) {
            cerrarModalProducto();
        }
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && modal && !modal.hidden) {
            cerrarModalProducto();
        }
    });

    document.getElementById('nombre')?.addEventListener('blur', function () {
        const slugInput = document.getElementById('slug');
        if (slugInput && !slugInput.value && this.value) {
            slugInput.value = this.value.toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/(^-|-$)/g, '');
        }
    });

    document.getElementById('btnAgregarImagen')?.addEventListener('click', agregarImagenInput);
    document.getElementById('imagenesContainer')?.addEventListener('click', event => {
        if (!event.target.matches('.btn-eliminar-imagen')) return;
        const items = document.querySelectorAll('#imagenesContainer .imagen-item');
        if (items.length > 1) {
            event.target.closest('.imagen-item')?.remove();
            actualizarIndicesImagenes();
        }
    });

    document.getElementById('btnAgregarIngrediente')?.addEventListener('click', agregarIngredienteInput);
    document.getElementById('ingredientesContainer')?.addEventListener('click', event => {
        if (!event.target.matches('.btn-eliminar-ingrediente')) return;
        const items = document.querySelectorAll('#ingredientesContainer .ingrediente-item');
        if (items.length > 1) {
            event.target.closest('.ingrediente-item')?.remove();
            actualizarIndicesIngredientes();
        }
    });
}

function agregarImagenInput() {
    const container = document.getElementById('imagenesContainer');
    if (!container) return;

    const index = container.children.length;
    const div = document.createElement('div');
    div.className = 'imagen-item';
    div.innerHTML = `
        <input type="url" name="imagenes[${escapeHTML(index)}][url]" placeholder="URL de la imagen" required>
        <input type="text" name="imagenes[${escapeHTML(index)}][alt]" placeholder="Texto alternativo (opcional)">
        <select name="imagenes[${escapeHTML(index)}][posicion]">
            <option value="center">Centro</option>
            <option value="top">Arriba</option>
            <option value="bottom">Abajo</option>
            <option value="left">Izquierda</option>
            <option value="right">Derecha</option>
        </select>
        <label class="checkbox-inline">
            <input type="checkbox" name="imagenes[${escapeHTML(index)}][esPrincipal]" ${index === 0 ? 'checked' : ''}> Principal
        </label>
        <button type="button" class="btn-eliminar-imagen" title="Eliminar imagen">Eliminar</button>
    `;
    container.appendChild(div);
    actualizarIndicesImagenes();
}

function actualizarIndicesImagenes() {
    const items = document.querySelectorAll('#imagenesContainer .imagen-item');
    items.forEach((item, index) => {
        item.querySelectorAll('input, select').forEach(input => {
            input.name = input.name.replace(/imagenes\[\d+\]/, `imagenes[${index}]`);
        });
    });
}

function agregarIngredienteInput() {
    const container = document.getElementById('ingredientesContainer');
    if (!container) return;

    const index = container.children.length;
    const div = document.createElement('div');
    div.className = 'ingrediente-item';
    div.innerHTML = `
        <input type="text" name="ingredientes[${escapeHTML(index)}][nombre]" placeholder="Nombre del ingrediente" required>
        <input type="text" name="ingredientes[${escapeHTML(index)}][descripcion]" placeholder="Descripción (opcional)">
        <button type="button" class="btn-eliminar-ingrediente" title="Eliminar">Eliminar</button>
    `;
    container.appendChild(div);
}

function actualizarIndicesIngredientes() {
    const items = document.querySelectorAll('#ingredientesContainer .ingrediente-item');
    items.forEach((item, index) => {
        item.querySelectorAll('input').forEach(input => {
            input.name = input.name.replace(/ingredientes\[\d+\]/, `ingredientes[${index}]`);
        });
    });
}

function abrirModalProducto(productoId = null) {
    const modal = document.getElementById('modalProducto');
    const form = document.getElementById('formProducto');
    const titulo = document.getElementById('modalProductoTitulo');
    if (!modal || !form || !titulo) return;

    form.reset();
    limpiarErroresFormulario(form);
    document.getElementById('productoId').value = '';
    document.getElementById('esEdicion').value = 'false';
    document.getElementById('activo').checked = true;

    const imgContainer = document.getElementById('imagenesContainer');
    if (imgContainer) {
        imgContainer.innerHTML = '';
        agregarImagenInput();
    }

    const ingContainer = document.getElementById('ingredientesContainer');
    if (ingContainer) {
        ingContainer.innerHTML = '';
        agregarIngredienteInput();
    }

    if (productoId) {
        titulo.textContent = 'Editar Producto';
        document.getElementById('esEdicion').value = 'true';
        document.getElementById('productoId').value = productoId;
        cargarProductoParaEditar(productoId);
    } else {
        titulo.textContent = 'Nuevo Producto';
    }

    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    document.getElementById('nombre')?.focus();
}

async function cargarProductoParaEditar(productoId) {
    // Token de secuencia: la llamada es async y no se espera, asi que si el
    // admin pulsa "Editar" en el producto A y enseguida en el B, la respuesta
    // de A puede llegar DESPUES que la de B y rellenar el formulario con los
    // datos de A mientras `productoId` guardado es el de B. Al guardar se
    // mandaba entonces PATCH del producto B con el contenido de A, corrompiendo
    // el catalogo (precios, nombres, imagenes) sin que nada lo indicara.
    // Cada invocacion toma un numero y, tras cada espera, se descarta si ya no
    // es la ultima.
    const miSecuencia = ++secuenciaEdicion;
    const esActual = () => miSecuencia === secuenciaEdicion;
    try {
        let producto = productosCache.find(item => item?._id === productoId);
        if (!producto) {
            const response = await api.getAdminProducts({ page: 1, limit: 50 });
            // Tras la espera: si el admin abrio otro producto, este resultado ya
            // no interesa y no debe pintar nada.
            if (!esActual()) return;
            if (!response.ok) {
                throw new Error(response.msg || 'No se pudo cargar el producto');
            }
            producto = (response.data?.products || []).find(item => item?._id === productoId);
        }
        if (!esActual()) return;
        if (!producto) {
            throw new Error('Producto no encontrado');
        }

        const form = document.getElementById('formProducto');
        if (!form) return;

        form.nombre.value = producto.nombre || '';
        form.slug.value = producto.slug || '';
        form.precio.value = producto.precio ?? '';
        form.precioAnterior.value = producto.precioAnterior ?? '';
        form.stock.value = producto.stock ?? 0;
        form.descripcion.value = producto.descripcion || '';
        form.descripcionCorta.value = producto.descripcionCorta || '';
        form.categoria.value = producto.categoria?._id || '';
        form.marca.value = producto.marca?._id || '';
        form.uso.value = producto.uso || '';
        form.destacado.checked = producto.destacado || false;
        form.enPromocion.checked = producto.enPromocion || false;
        form.activo.checked = producto.activo !== false;

        const imgContainer = document.getElementById('imagenesContainer');
        if (imgContainer) {
            imgContainer.innerHTML = '';
            if (Array.isArray(producto.imagenes) && producto.imagenes.length) {
                producto.imagenes.forEach((imagen, index) => {
                    const div = document.createElement('div');
                    div.className = 'imagen-item';
                    div.innerHTML = `
                        <input type="url" name="imagenes[${escapeHTML(index)}][url]" value="${escapeHTML(imagen?.url || '')}" required>
                        <input type="text" name="imagenes[${escapeHTML(index)}][alt]" value="${escapeHTML(imagen?.alt || '')}" placeholder="Texto alternativo (opcional)">
                        <select name="imagenes[${escapeHTML(index)}][posicion]">
                            <option value="center" ${imagen?.posicion === 'center' ? 'selected' : ''}>Centro</option>
                            <option value="top" ${imagen?.posicion === 'top' ? 'selected' : ''}>Arriba</option>
                            <option value="bottom" ${imagen?.posicion === 'bottom' ? 'selected' : ''}>Abajo</option>
                            <option value="left" ${imagen?.posicion === 'left' ? 'selected' : ''}>Izquierda</option>
                            <option value="right" ${imagen?.posicion === 'right' ? 'selected' : ''}>Derecha</option>
                            ${// Posiciones relativas (izquierda/derecha + arriba/abajo).
                              // El modelo y el validador (Product.js y schemas.imagePosition)
                              // aceptan tambien valores como "30% 75%", que es como se
                              // encuadran las fotos de producto. El select solo ofrecia las
                              // 5 fijas, asi que al abrir y guardar un producto con una
                              // posicion relativa ninguna opcion coincidia y se guardaba
                              // "center": el encuadre se perdia en silencio. La ultima
                              // opcion conserva el valor original si no esta en la lista,
                              // de modo que no se puede perder.
                              ''}
                            <option value="left top" ${imagen?.posicion === 'left top' ? 'selected' : ''}>Superior izquierda</option>
                            <option value="right top" ${imagen?.posicion === 'right top' ? 'selected' : ''}>Superior derecha</option>
                            <option value="left bottom" ${imagen?.posicion === 'left bottom' ? 'selected' : ''}>Inferior izquierda</option>
                            <option value="right bottom" ${imagen?.posicion === 'right bottom' ? 'selected' : ''}>Inferior derecha</option>
                            ${!['center', 'top', 'bottom', 'left', 'right', 'left top', 'right top', 'left bottom', 'right bottom']
                                .includes(imagen?.posicion) && imagen?.posicion
                                ? `<option value="${escapeHTML(imagen.posicion)}" selected>${escapeHTML(imagen.posicion)} (personalizada)</option>`
                                : ''}
                        </select>
                        <label class="checkbox-inline">
                            <input type="checkbox" name="imagenes[${escapeHTML(index)}][esPrincipal]" ${imagen?.esPrincipal ? 'checked' : ''}> Principal
                        </label>
                        <button type="button" class="btn-eliminar-imagen" title="Eliminar imagen">Eliminar</button>
                    `;
                    imgContainer.appendChild(div);
                });
            } else {
                agregarImagenInput();
            }
        }

        const ingContainer = document.getElementById('ingredientesContainer');
        if (ingContainer) {
            ingContainer.innerHTML = '';
            if (Array.isArray(producto.ingredientes) && producto.ingredientes.length) {
                producto.ingredientes.forEach((ingrediente, index) => {
                    const div = document.createElement('div');
                    div.className = 'ingrediente-item';
                    div.innerHTML = `
                        <input type="text" name="ingredientes[${escapeHTML(index)}][nombre]" value="${escapeHTML(ingrediente?.nombre || '')}" required>
                        <input type="text" name="ingredientes[${escapeHTML(index)}][descripcion]" value="${escapeHTML(ingrediente?.descripcion || '')}" placeholder="Descripción (opcional)">
                        <button type="button" class="btn-eliminar-ingrediente" title="Eliminar">Eliminar</button>
                    `;
                    ingContainer.appendChild(div);
                });
            } else {
                agregarIngredienteInput();
            }
        }
    } catch (error) {
        // Si el admin ya abrio otro producto mientras esperaba, este fallo es del
        // producto anterior y no debe mostrarse: ensuciaria el formulario del que
        // el admin quiere de verdad.
        if (!esActual()) return;
        handleApiError({ message: error.message }, 'cargar-producto-editar');
    }
}

function cerrarModalProducto() {
    const modal = document.getElementById('modalProducto');
    if (modal) modal.hidden = true;
    document.body.style.overflow = '';
}

async function confirmarEliminar(productoId) {
    if (!confirm('¿Desactivar este producto? Dejará de estar visible en la tienda.')) return;

    try {
        const response = await api.request(`/admin/productos/${encodeURIComponent(productoId)}`, { method: 'DELETE' });
        if (!response.ok) {
            throw new Error(response.msg || 'No se pudo desactivar el producto');
        }

        mostrarToast('Producto desactivado');
        await cargarProductos(paginaActual);
    } catch (error) {
        handleApiError({ message: error.message }, 'desactivar-producto');
    }
}

function inicializarFormulario() {
    const form = document.getElementById('formProducto');
    const btnGuardar = document.getElementById('btnGuardarProducto');
    if (!form || !btnGuardar) return;

    form.addEventListener('submit', async event => {
        event.preventDefault();
        limpiarErroresFormulario(form);

        const formData = new FormData(form);
        const data = {};
        const esEdicion = form.esEdicion.value === 'true';
        const optionalKeys = ['descripcionCorta', 'uso', 'precioAnterior'];

        ['nombre', 'slug', 'descripcion', 'descripcionCorta', 'categoria', 'marca', 'uso', 'precio', 'precioAnterior', 'stock'].forEach(key => {
            const value = formData.get(key);
            if (value !== null && value !== '') {
                data[key] = ['precio', 'precioAnterior', 'stock'].includes(key) ? Number(value) : value;
            } else if (esEdicion && optionalKeys.includes(key)) {
                data[key] = null;
            }
        });

        ['destacado', 'enPromocion', 'activo'].forEach(key => {
            data[key] = formData.get(key) === 'on';
        });

        const imagenes = [];
        form.querySelectorAll('input[name^="imagenes["][name$="[url]"]').forEach(input => {
            const url = formData.get(input.name);
            if (!url) return;
            const match = input.name.match(/^imagenes\[(\d+)\]\[url\]$/);
            const index = match ? match[1] : '0';
            imagenes.push({
                url,
                alt: formData.get(`imagenes[${index}][alt]`) || '',
                posicion: formData.get(`imagenes[${index}][posicion]`) || 'center',
                esPrincipal: formData.get(`imagenes[${index}][esPrincipal]`) === 'on'
            });
        });
        data.imagenes = imagenes;

        const ingredientes = [];
        form.querySelectorAll('input[name^="ingredientes["][name$="[nombre]"]').forEach(input => {
            const nombre = formData.get(input.name);
            if (!nombre) return;
            const match = input.name.match(/^ingredientes\[(\d+)\]\[nombre\]$/);
            const index = match ? match[1] : '0';
            ingredientes.push({
                nombre,
                descripcion: formData.get(`ingredientes[${index}][descripcion]`) || ''
            });
        });
        data.ingredientes = ingredientes;

        if (!data.nombre || !data.descripcion || !data.categoria || !data.marca || !data.imagenes.length) {
            mostrarMensajeGlobal(form, 'Completa los campos obligatorios', 'error');
            return;
        }

        setBtnLoading(btnGuardar, true);

        try {
            const productoId = form.productoId.value;
            const endpoint = esEdicion
                ? `/admin/productos/${encodeURIComponent(productoId)}`
                : '/admin/productos';
            const response = await api.request(endpoint, {
                method: esEdicion ? 'PATCH' : 'POST',
                body: JSON.stringify(data)
            });
            if (!response.ok) {
                throw apiErrorFromResponse(response, 'No se pudo guardar el producto');
            }

            mostrarToast(esEdicion ? 'Producto actualizado' : 'Producto creado');
            cerrarModalProducto();
            await cargarProductos(paginaActual);
        } catch (error) {
            handleApiError({ message: error.message, data: error.data }, 'guardar-producto');
            if (error.data?.errors && Array.isArray(error.data.errors)) {
                error.data.errors.forEach(item => {
                    const input = form.elements.namedItem(item.field);
                    if (input) mostrarErrorCampo(input, item.message);
                });
            }
        } finally {
            setBtnLoading(btnGuardar, false);
        }
    });
}

function mostrarToast(mensaje) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = mensaje;
    toast.style.cssText = `
        position: fixed; bottom: calc(100px + env(safe-area-inset-bottom, 0px)); left: 50%; transform: translateX(-50%);
            box-sizing: border-box; max-width: calc(100vw - 32px); text-align: center;
        background: var(--color-mauve); color: white; padding: 14px 24px;
        border-radius: 25px; font: 600 0.9rem var(--fuente-texto);
        box-shadow: 0 6px 20px rgb(0 0 0 / 20%); z-index: 1000;
        animation: slideUp 0.3s ease;
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'slideUp 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function formatearMoneda(valor) {
    return formatearPrecio(valor);
}

function debounce(fn, delay) {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
}
