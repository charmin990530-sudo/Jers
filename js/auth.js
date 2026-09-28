/**
 * auth.js - Lógica compartida para páginas de autenticación (login, register)
 * Exporta utilidades reutilizables: validación, manejo de errores, llamada a API, toast
 */

import { API_BASE_URL } from './config.js';
import { ensureCsrfToken } from './csrf.js';

// ==========================================
// SINCRONIZACIÓN DE CARRITO (localStorage ↔ API)
// ==========================================

const CART_KEY = 'jers_carrito';

/**
 * Obtiene carrito local del localStorage
 * @returns {Array} Array de items del carrito local
 */
function obtenerCarritoLocal() {
    try {
        return JSON.parse(localStorage.getItem(CART_KEY)) || [];
    } catch {
        return [];
    }
}

/**
 * Limpia carrito local después de merge exitoso
 */
function limpiarCarritoLocal() {
    localStorage.removeItem(CART_KEY);
}

/**
 * Sincroniza carrito local → API tras login/registro exitoso
 * POST /api/cart con array de items (el backend mergea sumando cantidades)
 * @returns {Promise<boolean>} true si sync exitoso
 */
export async function sincronizarCarritoTrasAuth() {
    const carritoLocal = obtenerCarritoLocal();
    
    if (!carritoLocal.length) {
        return true; // Nada que sincronizar
    }

    try {
        // Importar api dinámicamente para evitar dependencia circular
        const { addToCart, getCart } = await import('./apiClient.js');
        const current = await getCart();
        if (!current.ok) throw new Error(current.msg || 'No se pudo leer el carrito');
        const serverItems = current.data?.cart?.items || [];

        for (const item of carritoLocal) {
            const existing = serverItems.find(serverItem => serverItem.producto?._id === item.id || serverItem.producto === item.id);
            const pending = Math.max(0, Number(item.cantidad || 0) - Number(existing?.cantidad || 0));
            if (!pending) continue;
            const response = await addToCart({ productoId: item.id, cantidad: pending });
            if (!response.ok) throw new Error(response.msg);
        }
        
        // Si todo OK, limpiar localStorage
        limpiarCarritoLocal();
        
        console.log('[Auth] Carrito local sincronizado con API:', carritoLocal.length, 'items');
        return true;
        
    } catch (error) {
        console.error('[Auth] Error sincronizando carrito:', error);
        // NO limpiar localStorage si falla - reintentar en próxima carga
        return false;
    }
}

/**
 * Verifica si el usuario está autenticado llamando a /api/auth/me
 * @returns {Promise<{autenticado: boolean, user?: Object}>}
 */
export async function verificarAuth() {
    try {
        const { getMe } = await import('./apiClient.js');
        const response = await getMe();
        if (!response.ok) {
            return { autenticado: false, user: null };
        }
        return { autenticado: true, user: response.data.user };
    } catch {
        return { autenticado: false, user: null };
    }
}

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
    input.setAttribute('aria-invalid', 'true');
    const errorSpan = input.parentElement.querySelector('.campo-error');
    if (errorSpan) {
        errorSpan.textContent = mensaje;
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

// ==========================================
// LLAMADAS A LA API (nuevo formato {ok, msg, data})
// ==========================================

function buildUrl(endpoint) {
    return `${API_BASE_URL}${endpoint}`;
}

/**
 * Opciones por defecto para todas las peticiones
 * @returns {object}
 */
function getDefaultOptions() {
    return {
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
    };
}

/**
 * Función genérica para hacer peticiones HTTP
 * @param {string} endpoint
 * @param {object} options
 * @returns {Promise<{ok: boolean, msg: string, data: any}>}
 */
async function request(endpoint, options = {}) {
    const url = buildUrl(endpoint);
    const method = String(options.method || 'GET').toUpperCase();
    const defaultOptions = getDefaultOptions();

    const fetchOptions = {
        ...defaultOptions,
        ...options,
        headers: {
            ...defaultOptions.headers,
            ...(options.headers || {}),
        },
    };

    if (fetchOptions.body && !(fetchOptions.body instanceof FormData) && typeof fetchOptions.body !== 'string') {
        fetchOptions.body = JSON.stringify(fetchOptions.body);
    }

    try {
        if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
            const csrfToken = await ensureCsrfToken();
            if (!csrfToken) {
                return { ok: false, msg: 'No se pudo iniciar la sesión segura', data: { code: 'CSRF_TOKEN_MISSING' } };
            }
            if (!fetchOptions.headers['X-CSRF-Token']) fetchOptions.headers['X-CSRF-Token'] = csrfToken;
        }
        const response = await fetch(url, fetchOptions);

        if (response.status === 204) {
            return { ok: true, msg: 'Operación exitosa', data: null };
        }

        let data;
        try {
            data = await response.json();
        } catch {
            return { ok: false, msg: 'Respuesta inválida del servidor', data: null };
        }

        if (!response.ok) {
            const envelope = data && data.error ? data.error : {};
            return {
                ok: false,
                msg: envelope.message || data?.message || 'Error en la petición',
                data: {
                    ...envelope,
                    errors: envelope.details || envelope.errors || data?.errors,
                    requestId: data?.requestId,
                    status: response.status,
                },
            };
        }

        return { ok: true, msg: data.message || 'Operación exitosa', data: data };

    } catch (error) {
        if (error instanceof TypeError && error.message.includes('fetch')) {
            return { ok: false, msg: 'No se puede conectar con el servidor. Intenta de nuevo más tarde.', data: null };
        }
        return { ok: false, msg: error.message || 'Error inesperado', data: null };
    }
}

export async function apiFetch(endpoint, options = {}) {
    const normalizedEndpoint = endpoint.startsWith('/api/')
        ? endpoint.slice(4)
        : endpoint;
    const response = await request(normalizedEndpoint, options);

    if (!response.ok) {
        const error = new Error(response.msg);
        Object.assign(error, response.data || {}, {
            status: response.data?.status,
        });
        throw error;
    }

    return response.data;
}

/**
 * Login: POST /api/auth/login
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ok: boolean, msg: string, data: any}>}
 */
export async function apiLogin(email, password, rememberMe = false) {
    return await request('/auth/login', {
        method: 'POST',
        body: { email, password, rememberMe },
    });
}

/**
 * Register: POST /api/auth/register
 * @param {Object} data
 * @returns {Promise<{ok: boolean, msg: string, data: any}>}
 */
export async function apiRegister(data) {
    return await request('/auth/register', {
        method: 'POST',
        body: data,
    });
}

/**
 * Obtener usuario actual: GET /api/auth/me
 * @returns {Promise<{ok: boolean, msg: string, data: any}>}
 */
export async function apiGetMe() {
    return await request('/auth/me');
}

/**
 * Logout: POST /api/auth/logout
 * @returns {Promise<{ok: boolean, msg: string, data: any}>}
 */
export async function apiLogout() {
    return await request('/auth/logout', { method: 'POST' });
}

// ==========================================
// REDIRECCIÓN INTELIGENTE POST-LOGIN
// ==========================================

/**
 * Guarda URL de retorno antes de ir a login
 * Se llama desde páginas protegidas cuando no hay sesión
 */
export function guardarUrlRetorno() {
    const url = window.location.pathname + window.location.search;
    // No guardar URLs de auth mismas
    if (!/^\/(login|register|reset-password)\.html/.test(url)) {
        sessionStorage.setItem('auth_redirect_url', url);
    }
}

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