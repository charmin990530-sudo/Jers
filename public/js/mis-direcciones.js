/**
 * mis-direcciones.js - Página de Gestión de Direcciones
 * 
 * FLUJO:
 * 1. Verifica autenticación (GET /api/auth/me)
 * 2. Obtiene direcciones del usuario (incluidas en /api/auth/me)
 * 3. CRUD completo: Crear, Leer, Actualizar, Eliminar
 * 4. POST /api/auth/addresses - Agregar
 * 5. PATCH /api/auth/addresses/:id - Actualizar
 * 6. DELETE /api/auth/addresses/:id - Eliminar
 * 7. Lógica: solo una dirección principal a la vez
 */

import { getMe, addAddress, updateAddress, deleteAddress, handleApiError } from './apiClient.js';
import { 
    iniciarAplicacion,
    mostrarErrorCampo,
    limpiarErrorCampo,
    limpiarErroresFormulario,
    mostrarMensajeGlobal,
    setBtnLoading
} from './app.js';
import { escapeHTML } from './sanitize.js';

let direcciones = [];
let direccionAEliminar = null;

document.addEventListener('DOMContentLoaded', async () => {
    iniciarAplicacion();
    await verificarAuthYCargar();
    inicializarModalDireccion();
    inicializarModalEliminar();
    inicializarFormularioDireccion();
});

/**
 * Verifica autenticación y carga direcciones
 */
async function verificarAuthYCargar() {
    const response = await getMe();
    if (!response.ok) {
        if (response.data?.status === 401 || response.msg?.includes('expirada') || response.msg?.includes('No autenticado')) {
            sessionStorage.setItem('auth_redirect_url', window.location.pathname);
            window.location.href = 'login.html';
        } else {
            handleApiError({ message: response.msg, status: response.data?.status }, 'mis-direcciones');
            mostrarError('No se pudieron cargar las direcciones');
        }
        return;
    }
    direcciones = Array.isArray(response.data?.user?.direcciones) ? response.data.user.direcciones : [];
    renderizarDirecciones();
}

/**
 * Renderiza lista de direcciones
 */
function renderizarDirecciones() {
    const contenedor = document.getElementById('direccionesContenido');
    const listaDirecciones = Array.isArray(direcciones) ? direcciones : [];

    if (!listaDirecciones.length) {
        contenedor.innerHTML = `
            <div class="direcciones-vacio">
                <div class="vacio-icon">📍</div>
                <h3>No tienes direcciones guardadas</h3>
                <p>Agrega tu primera dirección para comprar más rápido.</p>
                <button class="btn-primario" id="btnPrimeraDireccion">Agregar dirección</button>
            </div>
        `;
        document.getElementById('btnPrimeraDireccion')?.addEventListener('click', () => abrirModalDireccion());
        return;
    }

    contenedor.innerHTML = listaDirecciones.map(dir => {
        const id = escapeHTML(dir?._id || '');
        const alias = escapeHTML(dir?.alias || 'Sin alias');
        const nombreCompleto = escapeHTML(dir?.nombreCompleto || 'N/A');
        const direccion = escapeHTML(dir?.direccion || 'N/A');
        const ciudad = escapeHTML(dir?.ciudad || 'N/A');
        const departamento = escapeHTML(dir?.departamento || 'N/A');
        const codigoPostal = escapeHTML(dir?.codigoPostal || '');
        const telefono = escapeHTML(dir?.telefono || 'N/A');
        const esPrincipal = Boolean(dir?.esPrincipal);

        return `
        <article class="direccion-card ${esPrincipal ? 'principal' : ''}" data-id="${id}">
            ${esPrincipal ? '<span class="principal-badge">⭐ Principal</span>' : ''}
            
            <div class="direccion-info">
                <div class="direccion-header">
                    <h3 class="direccion-alias">${alias}</h3>
                    <span class="direccion-nombre">${nombreCompleto}</span>
                </div>
                
                <address class="direccion-detalle">
                    ${direccion}<br>
                    ${ciudad}, ${departamento}
                    ${codigoPostal ? ` ${codigoPostal}` : ''}<br>
                    Tel: ${telefono}
                </address>
            </div>

            <div class="direccion-acciones">
                <button class="btn-editar" type="button" data-id="${id}" aria-label="Editar ${alias}">
                    ✏️ Editar
                </button>
                ${!esPrincipal ? `
                    <button class="btn-principal" type="button" data-id="${id}" aria-label="Marcar ${alias} como principal">
                        ⭐ Hacer principal
                    </button>
                ` : ''}
                <button class="btn-eliminar-direccion" type="button" data-id="${id}" data-alias="${alias}" aria-label="Eliminar ${alias}">
                    🗑️ Eliminar
                </button>
            </div>
        </article>
    `;
    }).join('');

    // Event listeners
    contenedor.querySelectorAll('.btn-editar').forEach(btn => {
        btn.addEventListener('click', () => abrirModalDireccion(btn.dataset.id));
    });

    contenedor.querySelectorAll('.btn-principal').forEach(btn => {
        btn.addEventListener('click', () => marcarComoPrincipal(btn.dataset.id));
    });

    contenedor.querySelectorAll('.btn-eliminar-direccion').forEach(btn => {
        btn.addEventListener('click', () => abrirModalEliminar(btn.dataset.id, btn.dataset.alias));
    });
}

/**
 * Inicializa modal agregar/editar dirección
 */
function inicializarModalDireccion() {
    const modal = document.getElementById('modalDireccion');
    const btnAbrir = document.getElementById('btnAgregarDireccion');
    const btnCancelar = document.getElementById('btnCancelarDireccion');

    btnAbrir?.addEventListener('click', () => abrirModalDireccion());
    btnCancelar?.addEventListener('click', cerrarModalDireccion);

    modal?.addEventListener('click', (e) => {
        if (e.target === modal || e.target.matches('.modal-cerrar')) {
            cerrarModalDireccion();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal && !modal.hidden) {
            cerrarModalDireccion();
        }
    });
}

/**
 * Abre modal para agregar o editar
 * @param {string|null} addressId - ID para editar, null para agregar
 */
function abrirModalDireccion(addressId = null) {
    const modal = document.getElementById('modalDireccion');
    const form = document.getElementById('formDireccion');
    const titulo = document.getElementById('modalDireccionTitulo');

    // Reset form
    form.reset();
    limpiarErroresFormulario(form);
    document.getElementById('addressId').value = '';
    document.getElementById('esEdicion').value = 'false';

    if (addressId) {
        // Modo edición
        const dir = direcciones.find(d => d._id === addressId);
        if (!dir) return;

        titulo.textContent = 'Editar dirección';
        document.getElementById('esEdicion').value = 'true';
        document.getElementById('addressId').value = addressId;

        form.alias.value = dir.alias;
        form.nombreCompleto.value = dir.nombreCompleto;
        form.telefono.value = dir.telefono;
        form.direccion.value = dir.direccion;
        form.ciudad.value = dir.ciudad;
        form.departamento.value = dir.departamento;
        form.codigoPostal.value = dir.codigoPostal || '';
        form.esPrincipal.checked = dir.esPrincipal;

        // Si es principal, deshabilitar checkbox (no se puede desmarcar)
        if (dir.esPrincipal) {
            form.esPrincipal.disabled = true;
            form.esPrincipal.checked = true;
        } else {
            form.esPrincipal.disabled = false;
        }
    } else {
        // Modo agregar
        titulo.textContent = 'Agregar dirección';
        form.esPrincipal.disabled = false;
        
        // Si es la primera, marcar principal por defecto
        if (direcciones.length === 0) {
            form.esPrincipal.checked = true;
        }
    }

    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    form.alias.focus();
}

/**
 * Cierra modal dirección
 */
function cerrarModalDireccion() {
    const modal = document.getElementById('modalDireccion');
    modal.hidden = true;
    document.body.style.overflow = '';
}

/**
 * Inicializa modal confirmar eliminar
 */
function inicializarModalEliminar() {
    const modal = document.getElementById('modalEliminar');
    const btnCancelar = document.getElementById('btnCancelarEliminar');
    const btnConfirmar = document.getElementById('btnConfirmarEliminar');

    btnCancelar?.addEventListener('click', cerrarModalEliminar);
    btnConfirmar?.addEventListener('click', confirmarEliminar);

    modal?.addEventListener('click', (e) => {
        if (e.target === modal || e.target.matches('.modal-cerrar')) {
            cerrarModalEliminar();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal && !modal.hidden) {
            cerrarModalEliminar();
        }
    });
}

/**
 * Abre modal confirmar eliminar
 * @param {string} addressId
 * @param {string} alias
 */
function abrirModalEliminar(addressId, alias) {
    direccionAEliminar = addressId;
    const modal = document.getElementById('modalEliminar');
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
}

/**
 * Cierra modal eliminar
 */
function cerrarModalEliminar() {
    const modal = document.getElementById('modalEliminar');
    direccionAEliminar = null;
    modal.hidden = true;
    document.body.style.overflow = '';
}

/**
 * Confirma eliminación
 */
async function confirmarEliminar() {
    if (!direccionAEliminar) return;

    const btn = document.getElementById('btnConfirmarEliminar');
    setBtnLoading(btn, true);

    const response = await deleteAddress(direccionAEliminar);
    
    if (!response.ok) {
        handleApiError({ message: response.msg, status: response.data?.status }, 'eliminar-direccion');
        setBtnLoading(btn, false);
        return;
    }
    
    // Actualizar lista local
    direcciones = direcciones.filter(d => d._id !== direccionAEliminar);
    renderizarDirecciones();
    cerrarModalEliminar();
    
    mostrarToast('Dirección eliminada correctamente');
    setBtnLoading(btn, false);
}

/**
 * Marca dirección como principal
 * @param {string} addressId
 */
async function marcarComoPrincipal(addressId) {
    const response = await updateAddress(addressId, { esPrincipal: true });
    
    if (!response.ok) {
        handleApiError({ message: response.msg, status: response.data?.status }, 'principal-direccion');
        return;
    }
    
    // Actualizar lista local
    direcciones = direcciones.map(d => ({
        ...d,
        esPrincipal: d._id === addressId
    }));
    renderizarDirecciones();
    
    mostrarToast('Dirección principal actualizada');
}

/**
 * Inicializa formulario dirección
 */
function inicializarFormularioDireccion() {
    const form = document.getElementById('formDireccion');
    const btnGuardar = document.getElementById('btnGuardarDireccion');

    // Validación en tiempo real
    const campos = ['alias', 'nombreCompleto', 'telefono', 'direccion', 'ciudad', 'departamento'];
    campos.forEach(name => {
        const input = form[name];
        if (input) {
            input.addEventListener('blur', () => validarCampoDireccion(input));
            input.addEventListener('input', () => {
                if (input.getAttribute('aria-invalid') === 'true') {
                    limpiarErrorCampo(input);
                }
            });
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        limpiarErroresFormulario(form);

        // Validar todos los campos
        let valido = true;
        campos.forEach(name => {
            const input = form[name];
            if (input && !validarCampoDireccion(input)) valido = false;
        });

        if (!valido) {
            form.querySelector('[aria-invalid="true"]')?.focus();
            return;
        }

        setBtnLoading(btnGuardar, true);

        try {
            const data = {
                alias: form.alias.value.trim(),
                nombreCompleto: form.nombreCompleto.value.trim(),
                telefono: form.telefono.value.trim(),
                direccion: form.direccion.value.trim(),
                ciudad: form.ciudad.value.trim(),
                departamento: form.departamento.value.trim(),
                codigoPostal: form.codigoPostal.value.trim() || undefined,
                esPrincipal: form.esPrincipal.checked,
            };

            const esEdicion = form.esEdicion.value === 'true';
            const addressId = form.addressId.value;

            let response;
            if (esEdicion) {
                response = await updateAddress(addressId, data);
            } else {
                response = await addAddress(data);
            }

            if (!response.ok) {
                if (response.data?.errors && Array.isArray(response.data.errors)) {
                    response.data.errors.forEach(err => {
                        const input = form[err.field];
                        if (input) mostrarErrorCampo(input, err.message);
                    });
                } else {
                    mostrarMensajeGlobal(form, response.msg || 'Error al guardar dirección', 'error');
                }
                return;
            }

            // Recargar direcciones desde API para estado consistente
            const meResponse = await getMe();
            if (meResponse.ok) {
                direcciones = Array.isArray(meResponse.data?.user?.direcciones) ? meResponse.data.user.direcciones : [];
            }
            renderizarDirecciones();

            cerrarModalDireccion();
            mostrarToast(esEdicion ? 'Dirección actualizada' : 'Dirección agregada');

        } catch (error) {
            handleApiError({ message: error.message }, 'guardar-direccion');
            mostrarMensajeGlobal(form, error.message || 'Error al guardar dirección', 'error');
        } finally {
            setBtnLoading(btnGuardar, false);
        }
    });
}

/**
 * Valida un campo del formulario dirección
 * @param {HTMLInputElement} input
 * @returns {boolean}
 */
function validarCampoDireccion(input) {
    const value = input.value.trim();
    const name = input.name;

    const reglas = {
        alias: { min: 2, max: 30, msg: 'El alias debe tener entre 2 y 30 caracteres' },
        nombreCompleto: { min: 2, max: 100, msg: 'El nombre debe tener entre 2 y 100 caracteres' },
        telefono: { 
            validator: (v) => /^[\d\s\-\+\(\)]{7,20}$/.test(v), 
            msg: 'Teléfono inválido' 
        },
        direccion: { min: 5, max: 200, msg: 'La dirección debe tener entre 5 y 200 caracteres' },
        ciudad: { min: 2, max: 50, msg: 'La ciudad debe tener entre 2 y 50 caracteres' },
        departamento: { min: 2, max: 50, msg: 'El departamento debe tener entre 2 y 50 caracteres' },
    };

    const regla = reglas[name];
    if (!regla) return true;

    let valido = true;
    if (regla.validator) {
        valido = regla.validator(value);
    } else {
        valido = value.length >= regla.min && value.length <= regla.max;
    }

    if (!valido) {
        mostrarErrorCampo(input, regla.msg);
        return false;
    }

    limpiarErrorCampo(input);
    return true;
}

/**
 * Muestra toast temporal
 * @param {string} mensaje
 */
function mostrarToast(mensaje) {
    // Crear toast
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = mensaje;
    toast.style.cssText = `
        position: fixed;
        bottom: calc(100px + env(safe-area-inset-bottom, 0px));
        left: 50%;
        transform: translateX(-50%);
        box-sizing: border-box;
        max-width: calc(100vw - 32px);
        text-align: center;
        background: var(--color-mauve);
        color: white;
        padding: 14px 24px;
        border-radius: 25px;
        font: 600 0.9rem var(--fuente-texto);
        box-shadow: 0 6px 20px rgb(0 0 0 / 20%);
        z-index: 1000;
        animation: slideUp 0.3s ease;
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideUp 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/**
 * Muestra error genérico
 */
function mostrarError(mensaje) {
    const contenedor = document.getElementById('direccionesContenido');
    contenedor.innerHTML = `
        <div class="direccion-error">
            <p>${escapeHTML(mensaje)}</p>
            <button class="btn-reintentar" type="button">Reintentar</button>
        </div>
    `;
    contenedor.querySelector('.btn-reintentar')?.addEventListener('click', () => window.location.reload());
}

// Agregar keyframes para toast
const style = document.createElement('style');
style.textContent = `
    @keyframes slideUp {
        from { opacity: 0; transform: translateX(-50%) translateY(20px); }
        to { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
`;
document.head.appendChild(style);