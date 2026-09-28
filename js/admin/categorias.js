import { api, handleApiError, apiErrorFromResponse } from '../../js/apiClient.js';
import {
    iniciarAplicacion,
    mostrarErrorCampo,
    limpiarErroresFormulario,
    mostrarMensajeGlobal,
    setBtnLoading
} from '../../js/app.js';
import { escapeHTML, safeAssetUrl } from '../../js/sanitize.js';

document.addEventListener('DOMContentLoaded', async () => {
    iniciarAplicacion();
    await verificarAdminYCargar();
    inicializarModal();
    inicializarFormulario();
});

async function verificarAdminYCargar() {
    try {
        const response = await api.getMe();
        if (!response.ok) {
            const status = response.data?.status;
            if (status === 401 || status === 403) {
                window.location.href = '../login.html?redirect=admin/categorias.html';
            } else {
                handleApiError({ message: response.msg, status }, 'admin-categorias');
            }
            return;
        }

        const user = response.data?.user;
        if (!user || user.role !== 'admin') {
            window.location.href = '../index.html';
            return;
        }
        await cargarCategorias();
    } catch (error) {
        handleApiError({ message: error.message }, 'admin-categorias');
        window.location.href = '../login.html?redirect=admin/categorias.html';
    }
}

async function cargarCategorias() {
    const tbody = document.getElementById('categoriasBody');
    if (!tbody) return;

    try {
        const response = await api.getAdminCategories();
        if (!response.ok) {
            throw new Error(response.msg || 'No se pudieron cargar las categorías');
        }

        renderCategorias(Array.isArray(response.data?.categories) ? response.data.categories : []);
    } catch (error) {
        handleApiError({ message: error.message }, 'cargar-categorias');
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-state">Error al cargar categorías</td>
            </tr>
        `;
    }
}

function renderCategorias(categorias) {
    const tbody = document.getElementById('categoriasBody');
    const resultCount = document.getElementById('resultCount');
    if (!tbody) return;
    if (resultCount) resultCount.textContent = `${categorias.length} categoría${categorias.length !== 1 ? 's' : ''}`;

    if (!categorias.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-state">No hay categorías</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = categorias.map(categoria => {
        const imagen = safeAssetUrl(categoria?.imagen || '');
        const id = escapeHTML(categoria?._id || '');
        const nombre = escapeHTML(categoria?.nombre || 'Sin nombre');
        const slug = escapeHTML(categoria?.slug || 'N/A');
        const descripcion = categoria?.descripcion
            ? escapeHTML(categoria.descripcion)
            : '<span class="text-muted">Sin descripción</span>';
        const orden = escapeHTML(categoria?.orden ?? 0);
        const activo = categoria?.activo !== false;
        const imagenHtml = imagen
            ? `<img src="${escapeHTML(imagen)}" alt="${nombre}" class="tabla-imagen">`
            : '<span class="sin-imagen">Imagen</span>';

        return `
            <tr data-id="${id}">
                <td>${imagenHtml}</td>
                <td><strong>${nombre}</strong></td>
                <td><code>${slug}</code></td>
                <td>${descripcion}</td>
                <td>${orden}</td>
                <td>
                    <span class="estado-badge ${activo ? 'estado-activo' : 'estado-inactivo'}">
                        ${activo ? 'Activa' : 'Inactiva'}
                    </span>
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
        button.addEventListener('click', () => abrirModalCategoria(button.dataset.id));
    });
    tbody.querySelectorAll('.btn-eliminar').forEach(button => {
        button.addEventListener('click', () => confirmarEliminar(button.dataset.id));
    });
}

function inicializarModal() {
    const modal = document.getElementById('modalCategoria');
    const btnNuevo = document.getElementById('btnNuevaCategoria');
    const btnCancelar = document.getElementById('btnCancelarCategoria');

    btnNuevo?.addEventListener('click', () => abrirModalCategoria());
    btnCancelar?.addEventListener('click', cerrarModalCategoria);

    modal?.addEventListener('click', event => {
        if (event.target === modal || event.target.matches('.modal-cerrar')) {
            cerrarModalCategoria();
        }
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && modal && !modal.hidden) {
            cerrarModalCategoria();
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
}

function abrirModalCategoria(categoriaId = null) {
    const modal = document.getElementById('modalCategoria');
    const form = document.getElementById('formCategoria');
    const titulo = document.getElementById('modalCategoriaTitulo');
    if (!modal || !form || !titulo) return;

    form.reset();
    limpiarErroresFormulario(form);
    document.getElementById('categoriaId').value = '';
    document.getElementById('esEdicion').value = 'false';
    document.getElementById('activo').checked = true;
    document.getElementById('orden').value = '0';

    if (categoriaId) {
        titulo.textContent = 'Editar Categoría';
        document.getElementById('esEdicion').value = 'true';
        document.getElementById('categoriaId').value = categoriaId;
        cargarCategoriaParaEditar(categoriaId);
    } else {
        titulo.textContent = 'Nueva Categoría';
    }

    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    document.getElementById('nombre')?.focus();
}

async function cargarCategoriaParaEditar(categoriaId) {
    try {
        const response = await api.getAdminCategories();
        if (!response.ok) {
            throw new Error(response.msg || 'No se pudo cargar la categoría');
        }

        const categoria = (response.data?.categories || []).find(item => item?._id === categoriaId);
        if (!categoria) {
            throw new Error('Categoría no encontrada');
        }

        const form = document.getElementById('formCategoria');
        if (!form) return;
        form.nombre.value = categoria.nombre || '';
        form.slug.value = categoria.slug || '';
        form.descripcion.value = categoria.descripcion || '';
        form.orden.value = categoria.orden ?? 0;
        form.imagen.value = categoria.imagen || '';
        form.activo.checked = categoria.activo !== false;
    } catch (error) {
        handleApiError({ message: error.message }, 'cargar-categoria-editar');
    }
}

function cerrarModalCategoria() {
    const modal = document.getElementById('modalCategoria');
    if (modal) modal.hidden = true;
    document.body.style.overflow = '';
}

async function confirmarEliminar(categoriaId) {
    let checkResponse;
    try {
        checkResponse = await api.request(`/admin/categorias/${encodeURIComponent(categoriaId)}/check-products`, { method: 'GET' });
    } catch (error) {
        handleApiError({ message: error.message }, 'verificar-productos-categoria');
        return;
    }

    if (!checkResponse.ok) {
        handleApiError({ message: checkResponse.msg || 'No se pudo verificar la categoría' }, 'verificar-productos-categoria');
        return;
    }

    if (checkResponse.data?.hasProducts) {
        alert('No se puede desactivar una categoría que tiene productos asociados. Primero reasigna o elimina los productos.');
        return;
    }

    if (!confirm('¿Desactivar esta categoría? Dejará de estar visible en la tienda.')) return;

    try {
        const response = await api.request(`/admin/categorias/${encodeURIComponent(categoriaId)}`, { method: 'DELETE' });
        if (!response.ok) {
            throw new Error(response.msg || 'No se pudo desactivar la categoría');
        }

        mostrarToast('Categoría desactivada');
        await cargarCategorias();
    } catch (error) {
        handleApiError({ message: error.message }, 'desactivar-categoria');
    }
}

function inicializarFormulario() {
    const form = document.getElementById('formCategoria');
    const btnGuardar = document.getElementById('btnGuardarCategoria');
    if (!form || !btnGuardar) return;

    document.getElementById('slug')?.addEventListener('input', function () {
        this.value = this.value.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/(^-|-$)/g, '');
    });

    form.addEventListener('submit', async event => {
        event.preventDefault();
        limpiarErroresFormulario(form);

        const formData = new FormData(form);
        const data = {};
        const esEdicion = form.esEdicion.value === 'true';

        ['nombre', 'slug', 'descripcion', 'imagen', 'orden'].forEach(key => {
            const value = formData.get(key);
            if (value !== null && value !== '') {
                data[key] = key === 'orden' ? Number(value) : value;
            } else if (esEdicion && ['descripcion', 'imagen'].includes(key)) {
                data[key] = null;
            }
        });
        data.activo = formData.get('activo') === 'on';

        if (!data.nombre || !data.slug) {
            mostrarMensajeGlobal(form, 'Nombre y slug son obligatorios', 'error');
            return;
        }

        if (!/^[a-z0-9-]+$/.test(data.slug)) {
            mostrarErrorCampo(form.slug, 'El slug solo puede contener minúsculas, números y guiones');
            return;
        }

        setBtnLoading(btnGuardar, true);

        try {
            const categoriaId = form.categoriaId.value;
            const endpoint = esEdicion
                ? `/admin/categorias/${encodeURIComponent(categoriaId)}`
                : '/admin/categorias';
            const response = await api.request(endpoint, {
                method: esEdicion ? 'PATCH' : 'POST',
                body: JSON.stringify(data)
            });
            if (!response.ok) {
                throw apiErrorFromResponse(response, 'No se pudo guardar la categoría');
            }

            mostrarToast(esEdicion ? 'Categoría actualizada' : 'Categoría creada');
            cerrarModalCategoria();
            await cargarCategorias();
        } catch (error) {
            handleApiError({ message: error.message, data: error.data }, 'guardar-categoria');
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
