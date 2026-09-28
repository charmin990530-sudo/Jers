import { api, handleApiError } from '../../js/apiClient.js';
import { iniciarAplicacion } from '../../js/app.js';
import { escapeHTML } from '../../js/sanitize.js';

let paginaActual = 1;
let totalPaginas = 1;

const $ = id => document.getElementById(id);

document.addEventListener('DOMContentLoaded', async () => {
    iniciarAplicacion();
    inicializarControles();
    await verificarAdminYCargar();
});

async function verificarAdminYCargar() {
    try {
        const response = await api.getMe();
        if (!response.ok) {
            const status = response.data?.status;
            if (status === 401 || status === 403) {
                window.location.href = '../login.html?redirect=admin/usuarios.html';
            } else {
                handleApiError({ message: response.msg, status }, 'admin-usuarios');
            }
            return;
        }

        const user = response.data?.user;
        if (!user || user.role !== 'admin') {
            window.location.href = '../index.html';
            return;
        }
        await cargarUsuarios();
    } catch (error) {
        handleApiError({ message: error.message }, 'admin-usuarios');
        window.location.href = '../login.html?redirect=admin/usuarios.html';
    }
}

function inicializarControles() {
    $('filtroBuscar')?.addEventListener('input', debounce(() => {
        paginaActual = 1;
        cargarUsuarios();
    }, 350));
    $('filtroRol')?.addEventListener('change', () => {
        paginaActual = 1;
        cargarUsuarios();
    });
    $('filtroEstado')?.addEventListener('change', () => {
        paginaActual = 1;
        cargarUsuarios();
    });
    $('pagAnterior')?.addEventListener('click', () => {
        if (paginaActual > 1) cargarUsuarios(paginaActual - 1);
    });
    $('pagSiguiente')?.addEventListener('click', () => {
        if (paginaActual < totalPaginas) cargarUsuarios(paginaActual + 1);
    });
    $('modalRol')?.addEventListener('click', event => {
        if (event.target === $('modalRol') || event.target.matches('.modal-cerrar')) {
            cerrarModal();
        }
    });
    $('btnCancelarRol')?.addEventListener('click', cerrarModal);
    $('formRol')?.addEventListener('submit', guardarRol);
}

async function cargarUsuarios(pagina = 1) {
    const body = $('usuariosBody');
    if (!body) return;

    if (pagina === 1) {
        body.innerHTML = '<tr class="loading-row"><td colspan="8"><div class="spinner"></div> Cargando...</td></tr>';
    }

    const params = {
        page: pagina,
        limit: 10,
        search: $('filtroBuscar')?.value.trim() || '',
        role: $('filtroRol')?.value || '',
        activo: $('filtroEstado')?.value || ''
    };

    try {
        const response = await api.getUsers(params);
        if (!response.ok) {
            throw new Error(response.msg || 'No se pudieron cargar los usuarios');
        }

        const data = response.data || {};
        const users = Array.isArray(data.users) ? data.users : [];
        const total = Number(data.total) || 0;
        const pages = Math.max(0, Number(data.pages) || 0);
        renderUsuarios(users);
        paginaActual = Math.max(1, Number(data.page) || pagina);
        totalPaginas = Math.max(1, pages);

        const resultCount = $('resultCount');
        const pagination = $('pagination');
        const pagInfo = $('pagInfo');
        if (resultCount) resultCount.textContent = `${total} usuario${total !== 1 ? 's' : ''}`;
        if (pagination) pagination.hidden = pages <= 1;
        if (pagInfo) pagInfo.textContent = `Página ${paginaActual} de ${Math.max(pages, 1)}`;
        if ($('pagAnterior')) $('pagAnterior').disabled = paginaActual <= 1;
        if ($('pagSiguiente')) $('pagSiguiente').disabled = paginaActual >= totalPaginas;
    } catch (error) {
        handleApiError({ message: error.message }, 'cargar-usuarios');
        body.innerHTML = '<tr><td colspan="8" class="empty-state">No se pudieron cargar los usuarios</td></tr>';
    }
}

function renderUsuarios(usuarios) {
    const body = $('usuariosBody');
    if (!body) return;

    if (!usuarios.length) {
        body.innerHTML = '<tr><td colspan="8" class="empty-state">No hay usuarios</td></tr>';
        return;
    }

    body.innerHTML = usuarios.map(user => {
        const id = escapeHTML(user?._id || '');
        const nombreCompleto = user?.nombreCompleto
            || `${user?.nombre || ''} ${user?.apellido || ''}`.trim()
            || 'Sin nombre';
        const iniciales = `${user?.nombre?.[0] || ''}${user?.apellido?.[0] || ''}`.toUpperCase() || 'U';
        const fecha = user?.createdAt
            ? new Date(user.createdAt).toLocaleDateString('es-CO')
            : 'N/A';
        const role = user?.role === 'admin' ? 'admin' : 'user';
        const activo = user?.activo !== false;
        const roleLabel = user?.role === 'admin' ? 'Administrador' : 'Usuario';

        return `
            <tr data-id="${id}">
                <td><span class="user-avatar">${escapeHTML(iniciales)}</span></td>
                <td><strong>${escapeHTML(nombreCompleto)}</strong></td>
                <td>${escapeHTML(user?.email || 'N/A')}</td>
                <td>${escapeHTML(user?.telefono || 'N/A')}</td>
                <td><span class="role-badge role-${escapeHTML(role)}">${escapeHTML(roleLabel)}</span></td>
                <td><span class="status-badge ${activo ? 'status-active' : 'status-inactive'}">${activo ? 'Activo' : 'Inactivo'}</span></td>
                <td>${escapeHTML(fecha)}</td>
                <td>
                    <div class="acciones-cell">
                        <button type="button" class="btn-accion btn-editar" data-id="${id}" data-role="${escapeHTML(role)}" title="Cambiar rol">Rol</button>
                        <button type="button" class="btn-accion btn-toggle" data-id="${id}" title="${activo ? 'Desactivar' : 'Activar'}">${activo ? 'Pausar' : 'Activar'}</button>
                        <button type="button" class="btn-accion btn-eliminar" data-id="${id}" title="Desactivar">Desactivar</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    body.querySelectorAll('.btn-editar').forEach(button => {
        button.addEventListener('click', () => abrirModal(button.dataset.id, button.dataset.role));
    });
    body.querySelectorAll('.btn-toggle').forEach(button => {
        button.addEventListener('click', () => alternarEstado(button.dataset.id));
    });
    body.querySelectorAll('.btn-eliminar').forEach(button => {
        button.addEventListener('click', () => eliminarUsuario(button.dataset.id));
    });
}

function abrirModal(id, role) {
    if (!$('usuarioIdRol') || !$('formRol') || !$('modalRol')) return;
    $('usuarioIdRol').value = id;
    $('nuevoRol').value = role === 'admin' ? 'admin' : 'user';
    $('formRol').querySelector('.formulario-mensaje').textContent = '';
    $('modalRol').hidden = false;
    document.body.style.overflow = 'hidden';
    $('nuevoRol').focus();
}

function cerrarModal() {
    const modal = $('modalRol');
    if (modal) modal.hidden = true;
    document.body.style.overflow = '';
}

async function guardarRol(event) {
    event.preventDefault();
    const id = $('usuarioIdRol').value;
    const role = $('nuevoRol').value;
    const message = $('formRol').querySelector('.formulario-mensaje');
    const button = $('btnGuardarRol');
    if (!id || !message || !button) return;

    button.disabled = true;

    try {
        const response = await api.updateUserRole(encodeURIComponent(id), role);
        if (!response.ok) {
            throw new Error(response.msg || 'No se pudo actualizar el rol');
        }
        message.textContent = response.msg || 'Rol actualizado';
        cerrarModal();
        await cargarUsuarios(paginaActual);
    } catch (error) {
        message.textContent = error.message || 'No se pudo actualizar el rol';
    } finally {
        button.disabled = false;
    }
}

async function alternarEstado(id) {
    try {
        const response = await api.toggleUserActive(encodeURIComponent(id));
        if (!response.ok) {
            throw new Error(response.msg || 'No se pudo cambiar el estado');
        }
        await cargarUsuarios(paginaActual);
    } catch (error) {
        handleApiError({ message: error.message }, 'toggle-usuario');
    }
}

async function eliminarUsuario(id) {
    if (!confirm('¿Desactivar este usuario? No podrá iniciar sesión.')) return;
    try {
        const response = await api.deleteUser(encodeURIComponent(id));
        if (!response.ok) {
            throw new Error(response.msg || 'No se pudo desactivar el usuario');
        }
        await cargarUsuarios(paginaActual);
    } catch (error) {
        handleApiError({ message: error.message }, 'desactivar-usuario');
    }
}

function debounce(fn, delay) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(...args), delay);
    };
}
