import { api, handleApiError } from '../../js/apiClient.js';
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
                window.location.href = '../login.html?redirect=admin/marcas.html';
            } else {
                handleApiError({ message: response.msg, status }, 'admin-marcas');
            }
            return;
        }

        const user = response.data?.user;
        if (!user || user.role !== 'admin') {
            window.location.href = '../index.html';
            return;
        }
        await cargarMarcas();
    } catch (error) {
        handleApiError({ message: error.message }, 'admin-marcas');
        window.location.href = '../login.html?redirect=admin/marcas.html';
    }
}

async function cargarMarcas() {
    const tbody = document.getElementById('marcasBody');
    if (!tbody) return;

    try {
        const response = await api.getAdminBrands();
        if (!response.ok) {
            throw new Error(response.msg || 'No se pudieron cargar las marcas');
        }

        renderMarcas(Array.isArray(response.data?.brands) ? response.data.brands : []);
    } catch (error) {
        handleApiError({ message: error.message }, 'cargar-marcas');
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="empty-state">Error al cargar marcas</td>
            </tr>
        `;
    }
}

function renderMarcas(marcas) {
    const tbody = document.getElementById('marcasBody');
    const resultCount = document.getElementById('resultCount');
    if (!tbody) return;
    if (resultCount) resultCount.textContent = `${marcas.length} marca${marcas.length !== 1 ? 's' : ''}`;

    if (!marcas.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="empty-state">No hay marcas</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = marcas.map(marca => {
        const logo = safeAssetUrl(marca?.logo || '');
        const sitio = safeAssetUrl(marca?.sitioWeb || '');
        const id = escapeHTML(marca?._id || '');
        const nombre = escapeHTML(marca?.nombre || 'Sin nombre');
        const slug = escapeHTML(marca?.slug || 'N/A');
        const descripcion = marca?.descripcion
            ? escapeHTML(marca.descripcion)
            : '<span class="text-muted">Sin descripción</span>';
        const sitioHtml = sitio
            ? `<a href="${escapeHTML(sitio)}" target="_blank" rel="noopener">${escapeHTML(marca.sitioWeb)}</a>`
            : '<span class="text-muted">—</span>';
        const orden = escapeHTML(marca?.orden ?? 0);
        const activo = marca?.activo !== false;
        const logoHtml = logo
            ? `<img src="${escapeHTML(logo)}" alt="${nombre}" class="tabla-imagen">`
            : '<span class="sin-imagen">Marca</span>';

        return `
            <tr data-id="${id}">
                <td>${logoHtml}</td>
                <td><strong>${nombre}</strong></td>
                <td><code>${slug}</code></td>
                <td>${descripcion}</td>
                <td>${sitioHtml}</td>
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
        button.addEventListener('click', () => abrirModalMarca(button.dataset.id));
    });
    tbody.querySelectorAll('.btn-eliminar').forEach(button => {
        button.addEventListener('click', () => confirmarEliminar(button.dataset.id));
    });
}

function inicializarModal() {
    const modal = document.getElementById('modalMarca');
    const btnNuevo = document.getElementById('btnNuevaMarca');
    const btnCancelar = document.getElementById('btnCancelarMarca');

    btnNuevo?.addEventListener('click', () => abrirModalMarca());
    btnCancelar?.addEventListener('click', cerrarModalMarca);

    modal?.addEventListener('click', event => {
        if (event.target === modal || event.target.matches('.modal-cerrar')) {
            cerrarModalMarca();
        }
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && modal && !modal.hidden) {
            cerrarModalMarca();
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

function abrirModalMarca(marcaId = null) {
    const modal = document.getElementById('modalMarca');
    const form = document.getElementById('formMarca');
    const titulo = document.getElementById('modalMarcaTitulo');
    if (!modal || !form || !titulo) return;

    form.reset();
    limpiarErroresFormulario(form);
    document.getElementById('marcaId').value = '';
    document.getElementById('esEdicion').value = 'false';
    document.getElementById('activo').checked = true;
    document.getElementById('orden').value = '0';

    if (marcaId) {
        titulo.textContent = 'Editar Marca';
        document.getElementById('esEdicion').value = 'true';
        document.getElementById('marcaId').value = marcaId;
        cargarMarcaParaEditar(marcaId);
    } else {
        titulo.textContent = 'Nueva Marca';
    }

    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    document.getElementById('nombre')?.focus();
}

async function cargarMarcaParaEditar(marcaId) {
    try {
        const response = await api.getAdminBrands();
        if (!response.ok) {
            throw new Error(response.msg || 'No se pudo cargar la marca');
        }

        const marca = (response.data?.brands || []).find(item => item?._id === marcaId);
        if (!marca) {
            throw new Error('Marca no encontrada');
        }

        const form = document.getElementById('formMarca');
        if (!form) return;
        form.nombre.value = marca.nombre || '';
        form.slug.value = marca.slug || '';
        form.descripcion.value = marca.descripcion || '';
        form.orden.value = marca.orden ?? 0;
        form.logo.value = marca.logo || '';
        form.imagenBanner.value = marca.imagenBanner || '';
        form.sitioWeb.value = marca.sitioWeb || '';
        form.activo.checked = marca.activo !== false;
    } catch (error) {
        handleApiError({ message: error.message }, 'cargar-marca-editar');
    }
}

function cerrarModalMarca() {
    const modal = document.getElementById('modalMarca');
    if (modal) modal.hidden = true;
    document.body.style.overflow = '';
}

async function confirmarEliminar(marcaId) {
    let checkResponse;
    try {
        checkResponse = await api.request(`/admin/marcas/${encodeURIComponent(marcaId)}/check-products`, { method: 'GET' });
    } catch (error) {
        handleApiError({ message: error.message }, 'verificar-productos-marca');
        return;
    }

    if (!checkResponse.ok) {
        handleApiError({ message: checkResponse.msg || 'No se pudo verificar la marca' }, 'verificar-productos-marca');
        return;
    }

    if (checkResponse.data?.hasProducts) {
        alert('No se puede desactivar una marca que tiene productos asociados. Primero reasigna o elimina los productos.');
        return;
    }

    if (!confirm('¿Desactivar esta marca? Dejará de estar visible en la tienda.')) return;

    try {
        const response = await api.request(`/admin/marcas/${encodeURIComponent(marcaId)}`, { method: 'DELETE' });
        if (!response.ok) {
            throw new Error(response.msg || 'No se pudo desactivar la marca');
        }

        mostrarToast('Marca desactivada');
        await cargarMarcas();
    } catch (error) {
        handleApiError({ message: error.message }, 'desactivar-marca');
    }
}

function inicializarFormulario() {
    const form = document.getElementById('formMarca');
    const btnGuardar = document.getElementById('btnGuardarMarca');
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

        ['nombre', 'slug', 'descripcion', 'logo', 'imagenBanner', 'sitioWeb', 'orden'].forEach(key => {
            const value = formData.get(key);
            if (value !== null && value !== '') {
                data[key] = key === 'orden' ? Number(value) : value;
            } else if (esEdicion && ['descripcion', 'logo', 'imagenBanner', 'sitioWeb'].includes(key)) {
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
            const marcaId = form.marcaId.value;
            const endpoint = esEdicion
                ? `/admin/marcas/${encodeURIComponent(marcaId)}`
                : '/admin/marcas';
            const response = await api.request(endpoint, {
                method: esEdicion ? 'PATCH' : 'POST',
                body: JSON.stringify(data)
            });
            if (!response.ok) {
                throw new Error(response.msg || 'No se pudo guardar la marca');
            }

            mostrarToast(esEdicion ? 'Marca actualizada' : 'Marca creada');
            cerrarModalMarca();
            await cargarMarcas();
        } catch (error) {
            handleApiError({ message: error.message, data: error.data }, 'guardar-marca');
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
        position: fixed; bottom: 100px; left: 50%; transform: translateX(-50%);
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
