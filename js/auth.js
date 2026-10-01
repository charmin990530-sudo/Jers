/**
 * auth.js - Lógica compartida para páginas de autenticación (login, register)
 * Exporta utilidades reutilizables: validación, manejo de errores, llamada a API, toast
 */

import { request as apiRequest, login as apiLoginReal, register as apiRegisterReal } from './api.js';

// NOTA: este archivo ya NO implementa `request()`. Antes tenia una copia
// identica a la de apiClient.js con su propio manejo del sobre de error, del
// CSRF y de la sesión caducada, y por eso login y register se comportaban
// distinto del resto del sitio ante un 401. Ahora todo pasa por js/api.js.

// ==========================================
// SINCRONIZACIÓN DE CARRITO (localStorage ↔ API)
// ==========================================
// Se delega en js/carrito.js, que es la única implementación. Aquí quedaban
// antes tres copias de la misma fusión con tres comportamientos distintos, y una
// de ellas abortaba el merge entero si un solo item local no era válido
// (quedaba en localStorage para siempre y rompía cada inicio de sesión).

export { sincronizar as sincronizarCarritoTrasAuth } from './carrito.js';

// ==========================================
// UTILIDADES DE VALIDACIÓN LADO CLIENTE
// ==========================================

/**
 * Valida email con regex simple
 * @param {string} email
 * @returns {boolean}
 */
export function validarEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Valida teléfono colombiano (opcional)
 * @param {string} telefono
 * @returns {boolean}
 */
export function validarTelefono(telefono) {
    if (!telefono) return true;  // Opcional
    return /^[\d\s\-\+\(\)]{7,20}$/.test(telefono);
}

/**
 * Calcula fortaleza de contraseña (0-4)
 * @param {string} password
 * @returns {number} 0=muy débil, 4=muy fuerte
 */
export function calcularFortalezaPassword(password) {
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return Math.min(score, 4);
}

/**
 * Texto descriptivo para fortaleza
 * @param {number} score
 * @returns {string}
 */
export function textoFortaleza(score) {
    const textos = [
        'Muy débil',
        'Débil',
        'Media',
        'Fuerte',
        'Muy fuerte'
    ];
    return textos[score] || '';
}

/**
 * Valida que dos contraseñas coincidan
 * @param {string} pass1
 * @param {string} pass2
 * @returns {boolean}
 */
export function passwordsCoinciden(pass1, pass2) {
    return pass1 === pass2 && pass1.length > 0;
}

// ==========================================
// MANEJO DE ERRORES EN FORMULARIOS
// ==========================================

/**
 * Muestra error en un campo específico
 * @param {HTMLInputElement} input
 * @param {string} mensaje
 */
export function mostrarErrorCampo(input, mensaje) {
    if (!input) return;
    input.setAttribute('aria-invalid', 'true');

    // El mensaje se busca subiendo hasta el contenedor del CAMPO, no en el
    // padre inmediato. Con `parentElement` fallaba en todos los campos de
    // contraseña: el input vive dentro de un `.password-wrapper` (para el botón
    // de mostrar/ocultar) y el `<span class="campo-error">` es HERMANO de ese
    // wrapper, hijo del `.campo`. El mensaje se descartaba en silencio, asi que
    // "Las contraseñas no coinciden" NO aparecía nunca: el usuario pulsaba
    // Continuar, el foco saltaba al campo y noulledaba nada, con el formulario
    // aparentemente bloqueado y sin explicación.
    const contenedor = input.closest('.campo, .form-grupo, .checkbox-campo, fieldset, .mb-3') || input.parentElement;
    const errorSpan = contenedor?.querySelector('.campo-error');
    if (errorSpan) {
        errorSpan.textContent = mensaje;
        // Se enlaza el mensaje al control: sin `aria-describedby` el lector de
        // pantalla anuncia el error (el span es `aria-live`) pero al navegar
        // campo a campo el usuario no sabe a cual pertenece. WCAG 3.3.1.
        if (!errorSpan.id) errorSpan.id = `error-${input.id || 'campo'}`;
        const yaAnunciado = (input.getAttribute('aria-describedby') || '').split(/\s+/).includes(errorSpan.id);
        if (!yaAnunciado) {
            const previo = input.getAttribute('aria-describedby');
            input.setAttribute('aria-describedby', previo ? `${previo} ${errorSpan.id}` : errorSpan.id);
        }
    }
}

/**
 * Limpia error de un campo
 * @param {HTMLInputElement} input
 */
export function limpiarErrorCampo(input) {
    input.removeAttribute('aria-invalid');
    const errorSpan = input.parentElement.querySelector('.campo-error');
    if (errorSpan) {
        errorSpan.textContent = '';
    }
}

/**
 * Limpia todos los errores del formulario
 * @param {HTMLFormElement} form
 */
export function limpiarErroresFormulario(form) {
    form.querySelectorAll('[aria-invalid="true"]').forEach(input => {
        limpiarErrorCampo(input);
    });
    const msgGlobal = form.querySelector('.formulario-mensaje');
    if (msgGlobal) {
        msgGlobal.textContent = '';
        msgGlobal.className = 'formulario-mensaje';
    }
}

/**
 * Muestra mensaje global (error o éxito)
 * @param {HTMLFormElement} form
 * @param {string} mensaje
 * @param {'error'|'exito'} tipo
 */
export function mostrarMensajeGlobal(form, mensaje, tipo = 'error') {
    const msgGlobal = form.querySelector('.formulario-mensaje');
    if (msgGlobal) {
        msgGlobal.textContent = mensaje;
        msgGlobal.className = `formulario-mensaje ${tipo}`;
    }
}

// ==========================================
// ESTADO DE CARGA DEL BOTÓN
// ==========================================

/**
 * Pone botón en estado loading
 * @param {HTMLButtonElement} btn
 * @param {boolean} loading
 */
export function setBtnLoading(btn, loading) {
    const texto = btn.querySelector('.btn-texto');
    const loader = btn.querySelector('.btn-loader');

    if (loading) {
        btn.disabled = true;
        if (texto) texto.hidden = true;
        if (loader) loader.hidden = false;
    } else {
        btn.disabled = false;
        if (texto) texto.hidden = false;
        if (loader) loader.hidden = true;
    }
}

export async function apiFetch(endpoint, options = {}) {
    return apiRequest(endpoint, options);
}

/**
 * Login: POST /api/auth/login
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ok: boolean, msg: string, data: any}>}
 */
export async function apiLogin(email, password, rememberMe = false) {
    return apiLoginReal({ email, password, rememberMe });
}

/**
 * Register: POST /api/auth/register
 * @param {Object} data
 * @returns {Promise<{ok: boolean, msg: string, data: any}>}
 */
export async function apiRegister(data) {
    return apiRegisterReal(data);
}

// ==========================================
// REDIRECCIÓN INTELIGENTE POST-LOGIN
// ==========================================

/**
 * Obtiene y limpia URL de retorno
 * @returns {string} URL a redirigir (default: index.html)
 */
export function obtenerUrlRetorno() {
    const redirect = new URLSearchParams(window.location.search).get('redirect');
    const url = redirect || sessionStorage.getItem('auth_redirect_url');
    sessionStorage.removeItem('auth_redirect_url');
    if (url && /^\/(?!\/)[a-z0-9_./-]+(?:\.[a-z0-9]+)?(?:\?[^#]*)?(?:#.*)?$/i.test(url)) {
        return url;
    }
    return 'index.html';
}

/**
 * Redirige tras login/registro exitoso
 */
export function redirigirTrasAuth() {
    const url = obtenerUrlRetorno();
    window.location.href = url;
}

// ==========================================
// MODALES (Términos, Privacidad)
// ==========================================

/**
 * Inicializa modales con delegación de eventos
 */
export function inicializarModales() {
    // Abrir modal al click en enlaces con data-modal
    document.addEventListener('click', (e) => {
        const enlace = e.target.closest('[data-modal]');
        if (!enlace) return;
        e.preventDefault();
        const modalId = `modal${enlace.dataset.modal.charAt(0).toUpperCase() + enlace.dataset.modal.slice(1)}`;
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.hidden = false;
            modal.querySelector('.modal-cerrar')?.focus();
            document.body.style.overflow = 'hidden';
        }
    });

    // Cerrar modal: botón X, click en fondo, tecla Escape
    document.addEventListener('click', (e) => {
        if (e.target.matches('.modal-cerrar') || e.target.matches('.modal')) {
            const modal = e.target.closest('.modal');
            if (modal) {
                cerrarModal(modal);
            }
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const modalAbierto = document.querySelector('.modal:not([hidden])');
            if (modalAbierto) cerrarModal(modalAbierto);
        }
    });
}

/**
 * Cierra un modal
 * @param {HTMLElement} modal
 */
export function cerrarModal(modal) {
    modal.hidden = true;
    document.body.style.overflow = '';
}

// ==========================================
// INICIALIZACIÓN COMÚN (se llama desde login.js y register.js)
// ==========================================

/**
 * Inicializa componentes compartidos de auth
 * - Menú móvil, carrito, WhatsApp, chatbot, animaciones (de app.js)
 * - Modales de términos/privacidad
 * - Toggle password en todos los inputs type=password
 */
export function inicializarAuthComun() {
    // Importar dinámicamente para evitar dependencia circular
    import('./app.js').then(({ iniciarAplicacion }) => {
        iniciarAplicacion();
    });

    inicializarModales();
    inicializarTogglePassword();
}

/**
 * Inicializa botones mostrar/ocultar contraseña
 * Usa delegación para cubrir inputs dinámicos
 */
export function inicializarTogglePassword() {
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.password-toggle');
        if (!btn) return;

        const wrapper = btn.closest('.password-wrapper');
        const input = wrapper?.querySelector('input[type="password"], input[type="text"]');
        if (!input) return;

        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';

        // Actualizar iconos
        const abierto = btn.querySelector('.ojo-abierto');
        const cerrado = btn.querySelector('.ojo-cerrado');
        if (abierto && cerrado) {
            abierto.hidden = isPassword;
            cerrado.hidden = !isPassword;
        }
        btn.setAttribute('aria-label', isPassword ? 'Ocultar contraseña' : 'Mostrar contraseña');
    });
}